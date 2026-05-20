import { clipboard, desktopCapturer, dialog, ipcMain, nativeImage, screen, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getOverlays } from './windows/overlay';

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

export async function copyFocusedSnipToClipboard(): Promise<void> {
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
  if (!pngBase64) return;

  const buf = Buffer.from(pngBase64, 'base64');
  const img = nativeImage.createFromBuffer(buf);
  clipboard.writeImage(img);
}

export async function captureFocusedDisplay(): Promise<void> {
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const overlay = getOverlays().get(display.id);
  const selection = snipSelections.get(display.id) ?? null;

  if (!overlay || overlay.isDestroyed()) {
    // No overlay: fall back to a raw full-display capture.
    const dataUrl = await fullDisplayDataUrl(display);
    if (dataUrl) await persistDataUrl(dataUrl);
    return;
  }

  if (selection) {
    // Clear the dashed selection visually before the screen grab.
    setSnipSelection(display.id, null);
    await waitMs(60);
    const pngBase64 = await captureCroppedComposite(overlay, display, selection);
    if (pngBase64) await persistDataUrl(`data:image/png;base64,${pngBase64}`);
    return;
  }

  // No selection: full-display composite (existing behavior).
  const dataUrl = await fullDisplayDataUrl(display);
  if (!dataUrl) return;

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

async function persistDataUrl(dataUrl: string): Promise<void> {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(base64, 'base64');

  const day = new Date().toISOString().slice(0, 10);
  const defaultDir = path.join(os.homedir(), 'Pictures', 'Lekhini', day);
  fs.mkdirSync(defaultDir, { recursive: true });
  const defaultPath = path.join(defaultDir, `lekhini-${Date.now()}.png`);

  const result = await dialog.showSaveDialog({
    defaultPath,
    filters: [{ name: 'PNG', extensions: ['png'] }],
  });

  if (result.canceled || !result.filePath) return;
  fs.writeFileSync(result.filePath, buf);
}

export function registerCaptureIpc() {
  ipcMain.handle('snip:set', (_evt, payload: { displayId: number; rect: Rect }) => {
    setSnipSelection(payload.displayId, payload.rect);
  });
  ipcMain.handle('snip:clear', (_evt, payload: { displayId: number }) => {
    setSnipSelection(payload.displayId, null);
  });
  void BrowserWindow;
}
