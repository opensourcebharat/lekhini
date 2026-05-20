import {
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  nativeImage,
  screen,
  shell,
  BrowserWindow,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getOverlays } from './windows/overlay';
import { notifyStatus, onFocusRecheck, screenStatus } from './permissions';
import { persisted } from './persistence';
import { patch as patchHub } from './hub';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Per-display persistent snip selection.
const snipSelections = new Map<number, Rect>();

export function getSnipSelection(displayId: number): Rect | undefined {
  return snipSelections.get(displayId);
}

export function setSnipSelection(displayId: number, rect: Rect | null): void {
  if (rect) snipSelections.set(displayId, rect);
  else snipSelections.delete(displayId);
  const overlay = getOverlays().get(displayId);
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('overlay:snip-selection', rect);
  }
}

export function clearAllSnipSelections(): void {
  for (const id of Array.from(snipSelections.keys())) {
    setSnipSelection(id, null);
  }
}

export function getFocusedDisplayId(): number {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
}

// ─── Permission gating ──────────────────────────────────────────────
//
// macOS controls whether `desktopCapturer.getSources()` returns
// anything. We never preflight-bail: on 'granted' we proceed, on
// 'not-determined' we still call so the OS shows its native
// first-run prompt, and only on 'denied' do we surface our own
// modal. When the user grants the permission and refocuses Lekhini,
// onFocusRecheck retries the pending capture automatically.

type PendingAction = 'capture' | 'clipboard';
let pendingAction: PendingAction | null = null;

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function needsScreenModal(): boolean {
  if (process.platform !== 'darwin') return false;
  const status = screenStatus();
  return status === 'denied' || status === 'restricted';
}

function gateScreenForCapture(action: PendingAction): boolean {
  if (!needsScreenModal()) return true;
  broadcast('permissions:needed', { reason: 'screen' });
  pendingAction = action;
  onFocusRecheck((newStatus) => {
    // Pass the fresh status explicitly so renderers don't see the
    // possibly-stale getMediaAccessStatus cache.
    notifyStatus(newStatus);
    if (newStatus !== 'granted') return;
    const a = pendingAction;
    pendingAction = null;
    if (a === 'capture') void captureFocusedDisplay();
    else if (a === 'clipboard') void copyFocusedSnipToClipboard();
  });
  return false;
}

export async function copyFocusedSnipToClipboard(): Promise<void> {
  if (!gateScreenForCapture('clipboard')) return;

  const displayId = getFocusedDisplayId();
  const rect = snipSelections.get(displayId);
  if (!rect) return;

  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  if (!display) return;
  const overlay = getOverlays().get(displayId);
  if (!overlay || overlay.isDestroyed()) return;

  // Clear the dashed selection visually before the screen grab, so it
  // isn't baked into the captured image. The crop rect is already in hand.
  setSnipSelection(displayId, null);
  await waitMs(60);

  const pngBase64 = await captureCroppedComposite(overlay, display, rect);
  if (!pngBase64) {
    if (handleCaptureFailure()) return;
    broadcast('capture:error', {
      message: "Couldn't read the screen — try again.",
      recoverable: true,
    });
    return;
  }

  const buf = Buffer.from(pngBase64, 'base64');
  const img = nativeImage.createFromBuffer(buf);
  clipboard.writeImage(img);
}

export async function captureFocusedDisplay(): Promise<void> {
  if (!gateScreenForCapture('capture')) return;

  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const overlay = getOverlays().get(display.id);
  const selection = snipSelections.get(display.id) ?? null;

  if (!overlay || overlay.isDestroyed()) {
    // No overlay: fall back to a raw full-display capture.
    const dataUrl = await fullDisplayDataUrl(display);
    if (!dataUrl) {
      handleCaptureFailure();
      return;
    }
    await persistDataUrl(dataUrl);
    return;
  }

  if (selection) {
    // Clear the dashed selection visually before the screen grab.
    setSnipSelection(display.id, null);
    await waitMs(60);
    const pngBase64 = await captureCroppedComposite(overlay, display, selection);
    if (!pngBase64) {
      handleCaptureFailure();
      return;
    }
    await persistDataUrl(`data:image/png;base64,${pngBase64}`);
    return;
  }

  // No selection: full-display composite (existing behavior).
  const dataUrl = await fullDisplayDataUrl(display);
  if (!dataUrl) {
    handleCaptureFailure();
    return;
  }

  await new Promise<void>((resolve) => {
    const channel = 'capture:screenshot:result';
    const handler = async (_evt: Electron.IpcMainInvokeEvent, pngBase64: string) => {
      ipcMain.removeHandler(channel);
      await persistDataUrl(`data:image/png;base64,${pngBase64}`);
      resolve();
    };
    ipcMain.handle(channel, handler);
    overlay.webContents.send('overlay:screenshot', { dataUrl });
    setTimeout(() => {
      ipcMain.removeHandler(channel);
      resolve();
    }, 8000);
  });
}

// Called when desktopCapturer returns nothing. On macOS this almost
// always means permission was denied at the system prompt (which we
// can't intercept). Re-check status and surface the modal so the user
// gets feedback instead of silent failure.
function handleCaptureFailure(): boolean {
  if (needsScreenModal()) {
    broadcast('permissions:needed', { reason: 'screen' });
    pendingAction = 'capture';
    onFocusRecheck((newStatus) => {
      notifyStatus(newStatus);
      if (newStatus === 'granted' && pendingAction === 'capture') {
        pendingAction = null;
        void captureFocusedDisplay();
      }
    });
    return true;
  }
  return false;
}

async function fullDisplayDataUrl(display: Electron.Display): Promise<string | null> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: display.size.width * display.scaleFactor,
      height: display.size.height * display.scaleFactor,
    },
  });
  const matching =
    sources.find((s) => Number(s.display_id) === display.id) ?? sources[0];
  if (!matching) return null;
  return matching.thumbnail.toDataURL();
}

async function captureCroppedComposite(
  overlay: BrowserWindow,
  display: Electron.Display,
  rect: Rect,
): Promise<string | null> {
  const screenDataUrl = await fullDisplayDataUrl(display);
  if (!screenDataUrl) return null;

  return new Promise<string | null>((resolve) => {
    const channel = 'capture:snip:result';
    const handler = (_evt: Electron.IpcMainInvokeEvent, pngBase64: string) => {
      ipcMain.removeHandler(channel);
      resolve(pngBase64 || null);
    };
    ipcMain.handle(channel, handler);
    overlay.webContents.send('overlay:snip', {
      dataUrl: screenDataUrl,
      rect,
      scaleFactor: display.scaleFactor,
    });
    setTimeout(() => {
      ipcMain.removeHandler(channel);
      resolve(null);
    }, 8000);
  });
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Default filename: `lekhini-YYYY-MM-DD-HHMMSS.png`. Stable enough to
// sort chronologically, short enough to read at a glance.
function defaultFilename(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `lekhini-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`
  );
}

function defaultSaveDir(): string {
  return path.join(os.homedir(), 'Pictures', 'Lekhini');
}

async function persistDataUrl(dataUrl: string): Promise<void> {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(base64, 'base64');

  const state = persisted();
  const shouldPrompt = state.alwaysAskSavePath || !state.saveDir;

  let target: string;
  if (shouldPrompt) {
    const seedDir = state.saveDir ?? defaultSaveDir();
    try {
      fs.mkdirSync(seedDir, { recursive: true });
    } catch {
      // Non-fatal — showSaveDialog will still work even if mkdir failed.
    }
    const result = await dialog.showSaveDialog({
      title: 'Save annotated screenshot',
      defaultPath: path.join(seedDir, defaultFilename()),
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return;
    target = result.filePath;
    // Remember the chosen folder so the next save can skip the dialog.
    // Going through the hub keeps every renderer's Settings panel in sync.
    patchHub({ saveDir: path.dirname(target) });
  } else {
    // saveDir is non-null here per the check above.
    const dir = state.saveDir!;
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      broadcast('capture:error', {
        message: `Couldn't create save folder ${dir}: ${(err as Error).message}`,
        recoverable: true,
      });
      return;
    }
    target = path.join(dir, defaultFilename());
  }

  try {
    fs.writeFileSync(target, buf);
    broadcast('capture:saved', { path: target });
  } catch (err) {
    broadcast('capture:error', {
      message: `Couldn't save to ${target}: ${(err as Error).message}`,
      recoverable: true,
    });
  }
}

export function registerCaptureIpc() {
  ipcMain.handle('snip:set', (_evt, payload: { displayId: number; rect: Rect }) => {
    setSnipSelection(payload.displayId, payload.rect);
  });
  ipcMain.handle('snip:clear', (_evt, payload: { displayId: number }) => {
    setSnipSelection(payload.displayId, null);
  });
  // Renderer-triggered folder picker, used by the "Change…" button in
  // Settings → File save. Returns the chosen path so the renderer can
  // patch the hub with it (which is what persists + broadcasts to
  // every window). We don't save here ourselves — the renderer owns
  // the round-trip to keep the hub the single source of truth.
  ipcMain.handle('settings:save-dir:pick', async () => {
    const state = persisted();
    const result = await dialog.showOpenDialog({
      title: 'Choose save folder for screenshots',
      defaultPath: state.saveDir ?? defaultSaveDir(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
  // Reveal-in-Finder / file-manager link for the saved-toast.
  ipcMain.handle('shell:open-path', async (_evt, p: string) => {
    if (!p) return;
    try {
      // showItemInFolder reveals the file with it selected — better
      // than openPath which just opens the parent folder.
      shell.showItemInFolder(p);
    } catch {
      // Fall back to opening the containing folder.
      void shell.openPath(path.dirname(p));
    }
  });
  void BrowserWindow;
}
