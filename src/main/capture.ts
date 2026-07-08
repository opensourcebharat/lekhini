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
import { startChatSession } from './ai/ipc';
import type { ProfileId } from '../shared/types';

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
  onFocusRecheck((result) => {
    // Pass the fresh status explicitly so renderers don't see the
    // possibly-stale getMediaAccessStatus cache.
    notifyStatus(result.screen, result.probeError);
    if (result.screen !== 'granted') return;
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

  const png = await captureCroppedComposite(overlay, display, rect);
  if (!png) {
    handleCaptureFailure();
    return;
  }

  const img = nativeImage.createFromBuffer(png);
  clipboard.writeImage(img);
}

// Start an AI chat about the user's current snip selection. Same
// capture + composite path Save / Copy use; the bytes are handed to
// startChatSession which broadcasts chat:session and opens the dock
// chat panel.
export async function askAiAboutFocusedSnip(profile: ProfileId): Promise<void> {
  if (!gateScreenForCapture('clipboard')) return;
  const displayId = getFocusedDisplayId();
  const rect = snipSelections.get(displayId);
  if (!rect) return;
  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  if (!display) return;
  const overlay = getOverlays().get(displayId);
  if (!overlay || overlay.isDestroyed()) return;

  // Hide the dashed selection so it isn't baked into the PNG sent
  // to the AI (the existing crop rect is already in hand).
  setSnipSelection(displayId, null);
  await waitMs(60);

  const png = await captureCroppedComposite(overlay, display, rect);
  if (!png) {
    handleCaptureFailure();
    return;
  }
  startChatSession(png, 'image/png', profile);
}

export async function captureFocusedDisplay(): Promise<void> {
  if (!gateScreenForCapture('capture')) return;

  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const overlay = getOverlays().get(display.id);
  const selection = snipSelections.get(display.id) ?? null;

  if (!overlay || overlay.isDestroyed()) {
    // No overlay: fall back to a raw full-display capture (uncomposited).
    const raw = await fullDisplayPng(display);
    if (!raw) {
      handleCaptureFailure();
      return;
    }
    await persistPng(raw);
    return;
  }

  if (selection) {
    // Clear the dashed selection visually before the screen grab.
    setSnipSelection(display.id, null);
    await waitMs(60);
    const png = await captureCroppedComposite(overlay, display, selection);
    if (!png) {
      handleCaptureFailure();
      return;
    }
    await persistPng(png);
    return;
  }

  // No selection: full-display composite (existing behavior).
  const screenPng = await fullDisplayPng(display);
  if (!screenPng) {
    handleCaptureFailure();
    return;
  }

  await new Promise<void>((resolve) => {
    const channel = 'capture:screenshot:result';
    const handler = async (_evt: Electron.IpcMainInvokeEvent, png: Uint8Array) => {
      ipcMain.removeHandler(channel);
      await persistPng(Buffer.from(png));
      resolve();
    };
    ipcMain.handle(channel, handler);
    // Send the PNG as a Uint8Array — structured-clones across IPC as
    // raw bytes (no base64 round-trip), about 33% less data than the
    // old dataURL string and noticeably faster decode in the renderer
    // via createImageBitmap.
    overlay.webContents.send('overlay:screenshot', { png: screenPng });
    setTimeout(() => {
      ipcMain.removeHandler(channel);
      resolve();
    }, 8000);
  });
}

// Called when desktopCapturer returns nothing. On macOS this almost
// always means permission was denied at the system prompt (which we
// can't intercept) — surface the permission modal. Elsewhere (notably
// Linux/Wayland, where the portal request can be cancelled or fail)
// there is no permission panel to show, so emit a capture error —
// anything is better than silent failure.
function handleCaptureFailure(): boolean {
  if (needsScreenModal()) {
    broadcast('permissions:needed', { reason: 'screen' });
    pendingAction = 'capture';
    onFocusRecheck((result) => {
      notifyStatus(result.screen, result.probeError);
      if (result.screen === 'granted' && pendingAction === 'capture') {
        pendingAction = null;
        void captureFocusedDisplay();
      }
    });
    return true;
  }
  broadcast('capture:error', {
    message: "Couldn't read the screen — try again.",
    recoverable: true,
  });
  return false;
}

async function fullDisplayPng(display: Electron.Display): Promise<Buffer | null> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: display.size.width * display.scaleFactor,
      height: display.size.height * display.scaleFactor,
    },
  });
  // Match the requested display. `display_id` is reliable on macOS and
  // Windows but typically empty on Linux/Wayland (PipeWire portal), so
  // fall back to positional matching — getSources() returns screens in
  // the same order as screen.getAllDisplays() — before giving up and
  // taking the first source.
  let matching = sources.find((s) => Number(s.display_id) === display.id);
  if (!matching) {
    const index = screen.getAllDisplays().findIndex((d) => d.id === display.id);
    matching = sources[index] ?? sources[0];
  }
  if (!matching) return null;
  // toPNG() goes straight to a Buffer — no base64 dataURL middleman.
  // Buffer is structured-clonable over IPC as raw bytes.
  return matching.thumbnail.toPNG();
}

async function captureCroppedComposite(
  overlay: BrowserWindow,
  display: Electron.Display,
  rect: Rect,
): Promise<Buffer | null> {
  const screenPng = await fullDisplayPng(display);
  if (!screenPng) return null;

  return new Promise<Buffer | null>((resolve) => {
    const channel = 'capture:snip:result';
    const handler = (_evt: Electron.IpcMainInvokeEvent, png: Uint8Array) => {
      ipcMain.removeHandler(channel);
      resolve(png && png.byteLength > 0 ? Buffer.from(png) : null);
    };
    ipcMain.handle(channel, handler);
    overlay.webContents.send('overlay:snip', {
      png: screenPng,
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

async function persistPng(buf: Buffer): Promise<void> {
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
  ipcMain.handle('snip:ask-ai', async (_evt, payload: { profile: ProfileId }) => {
    await askAiAboutFocusedSnip(payload.profile);
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
