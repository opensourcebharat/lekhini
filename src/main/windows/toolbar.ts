import { BrowserWindow, app, ipcMain, screen } from 'electron';
import path from 'node:path';
import { SETTINGS_EXTRA, TOOLBAR_SIZES } from '../../shared/constants';
import { subscribe } from '../hub';
import type { Orientation } from '../../shared/types';

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let toolbar: BrowserWindow | null = null;

// Where the toolbar sat just before the settings panel opened. Restored
// on close so the toolbar snaps back to the user's chosen edge instead
// of drifting inward each open/close cycle.
let anchorPos: { x: number; y: number } | null = null;

// Collapsed pill: square enough to be a chunky tap target and big
// enough that a 36px logo with a 5px drag border breathes.
const MIN_SIZE = { w: 64, h: 64 };

function defaultPosition(orientation: Orientation, minimized: boolean, settingsOpen: boolean) {
  const primary = screen.getPrimaryDisplay();
  const { w, h } = sizeFor(orientation, minimized, settingsOpen);
  if (orientation === 'h') {
    const x = Math.round(primary.workArea.x + (primary.workArea.width - w) / 2);
    const y = primary.workArea.y + 24;
    return { x, y, w, h };
  }
  // Vertical default: anchor to the right edge. When settings is open,
  // the panel sits to the LEFT of the bar-main (which stays at the edge).
  const x = primary.workArea.x + primary.workArea.width - w - 24;
  const y = Math.round(primary.workArea.y + (primary.workArea.height - h) / 2);
  return { x, y, w, h };
}

export function sizeFor(orientation: Orientation, minimized: boolean, settingsOpen: boolean) {
  if (minimized) return MIN_SIZE;
  const base = TOOLBAR_SIZES[orientation];
  if (!settingsOpen) return { w: base.w, h: base.h };
  const extra = SETTINGS_EXTRA[orientation];
  return { w: base.w + extra.w, h: base.h + extra.h };
}

export function createToolbar(orientation: Orientation = 'h'): BrowserWindow {
  const pos = defaultPosition(orientation, false, false);

  toolbar = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: pos.w,
    height: pos.h,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  toolbar.setAlwaysOnTop(true, 'screen-saver', 2);
  toolbar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 'screen-saver' + relative level are macOS-only; on Windows/Linux
  // other topmost windows can end up above us. Re-assert whenever the
  // toolbar loses focus so it stays reachable.
  if (process.platform !== 'darwin') {
    toolbar.on('blur', () => {
      if (toolbar && !toolbar.isDestroyed()) {
        toolbar.setAlwaysOnTop(true, 'screen-saver', 2);
      }
    });
  }
  // Hide the toolbar from screen capture so the screenshot the user
  // takes via Lekhini contains the underlying app + their annotations
  // but NOT our toolbar chrome. macOS uses NSWindowSharingNone;
  // Windows uses SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE);
  // Linux is no-op. Also keeps the toolbar out of any other capture
  // tool the user runs (Loom, QuickTime, Zoom share, etc.).
  toolbar.setContentProtection(true);

  if (VITE_DEV_SERVER_URL) {
    toolbar.loadURL(`${VITE_DEV_SERVER_URL}src/renderer/toolbar/index.html`);
  } else {
    toolbar.loadFile(path.join(__dirname, '../../dist/src/renderer/toolbar/index.html'));
  }

  subscribe(toolbar);
  toolbar.once('closed', () => (toolbar = null));

  return toolbar;
}

export function getToolbar(): BrowserWindow | null {
  return toolbar;
}

export function resizeToolbar(
  orientation: Orientation,
  minimized: boolean,
  settingsOpen: boolean,
  reposition: 'keep' | 'default' = 'keep',
) {
  if (!toolbar || toolbar.isDestroyed()) return;
  const { w, h } = sizeFor(orientation, minimized, settingsOpen);

  if (reposition === 'default') {
    // Orientation changed — drop the existing anchor and place fresh.
    anchorPos = null;
    const pos = defaultPosition(orientation, minimized, settingsOpen);
    toolbar.setBounds({ x: pos.x, y: pos.y, width: pos.w, height: pos.h }, true);
    // If settings is still open after the orientation change, pre-seed
    // the anchor to the natural closed-panel position so the inevitable
    // close-event restores there instead of drifting on the width shrink.
    if (settingsOpen) {
      const closed = defaultPosition(orientation, minimized, false);
      anchorPos = { x: closed.x, y: closed.y };
    }
    return;
  }

  const [curX, curY] = toolbar.getPosition();
  const [curW] = toolbar.getSize();
  const display = screen.getDisplayNearestPoint({ x: curX, y: curY });

  if (!settingsOpen && anchorPos) {
    let { x: nextX, y: nextY } = anchorPos;
    anchorPos = null;
    nextX = clamp(nextX, display.workArea.x + 8, display.workArea.x + display.workArea.width - w - 8);
    nextY = clamp(nextY, display.workArea.y + 8, display.workArea.y + display.workArea.height - h - 8);
    toolbar.setBounds({ x: nextX, y: nextY, width: w, height: h }, true);
    return;
  }

  if (settingsOpen && !anchorPos) {
    anchorPos = { x: curX, y: curY };
  }

  let nextX = curX;
  let nextY = curY;

  // Vertical mode: settings panel grows to the left or the right of bar-main.
  // Pick the side based on which half of the screen the toolbar sits on so
  // the panel always extends inward (toward the screen center).
  if (orientation === 'v' && settingsOpen) {
    const toolbarCenterX = curX + curW / 2;
    const screenCenterX = display.workArea.x + display.workArea.width / 2;
    const growLeft = toolbarCenterX > screenCenterX;
    if (growLeft) {
      nextX = curX + curW - w;
    }
  }

  nextX = clamp(nextX, display.workArea.x + 8, display.workArea.x + display.workArea.width - w - 8);
  nextY = clamp(nextY, display.workArea.y + 8, display.workArea.y + display.workArea.height - h - 8);
  toolbar.setBounds({ x: nextX, y: nextY, width: w, height: h }, true);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function isToolbarOnRightSide(): boolean {
  if (!toolbar || toolbar.isDestroyed()) return false;
  const [curX, curY] = toolbar.getPosition();
  const [curW] = toolbar.getSize();
  const display = screen.getDisplayNearestPoint({ x: curX, y: curY });
  const toolbarCenterX = curX + curW / 2;
  const screenCenterX = display.workArea.x + display.workArea.width / 2;
  return toolbarCenterX > screenCenterX;
}

export function registerToolbarIpc() {
  ipcMain.handle('window:close', () => {
    app.quit();
  });
  ipcMain.handle('window:minimize', () => {
    // handled via hub state; nothing else here
  });
  ipcMain.handle('window:platform', () => process.platform);
  ipcMain.handle('toolbar:on-right-side', () => isToolbarOnRightSide());
  // App identity for the About panel. Reads from package.json via Electron.
  ipcMain.handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    // isPackaged is the canonical Electron check for production vs
    // dev-server run. Surfaced so the renderer can flag dev-mode TCC
    // quirks (which are normal in dev but absent in packaged builds).
    packaged: app.isPackaged,
  }));
  // Renderer reports its desired content height (vertical) or width
  // (horizontal). Main resizes the window to fit so empty space below
  // the controls doesn't accumulate when content is short. The renderer
  // sets the size axis matching the bar's orientation; the other axis
  // is preserved from the current window bounds.
  ipcMain.handle('toolbar:set-content-size', (_evt, payload: { axis: 'h' | 'v'; size: number }) => {
    if (!toolbar || toolbar.isDestroyed()) return;
    const [curX, curY] = toolbar.getPosition();
    const [curW, curH] = toolbar.getSize();
    const display = screen.getDisplayNearestPoint({ x: curX, y: curY });
    // Low minimums — dynamic sizing in h-mode produces ~72px when the
    // popup is closed. A larger floor would clamp the report and leave
    // a forced empty band in the bar.
    const minH = 60;
    const minW = 60;
    // Anchor the resize axis by the current center so growing/shrinking
    // doesn't shove the toolbar toward one edge. The other axis is left
    // alone.
    if (payload.axis === 'v') {
      const nextH = clamp(Math.round(payload.size), minH, display.workArea.height - 16);
      if (nextH === curH) return;
      const centerY = curY + curH / 2;
      const nextY = clamp(
        Math.round(centerY - nextH / 2),
        display.workArea.y + 8,
        display.workArea.y + display.workArea.height - nextH - 8,
      );
      toolbar.setBounds({ x: curX, y: nextY, width: curW, height: nextH }, false);
    } else {
      const nextW = clamp(Math.round(payload.size), minW, display.workArea.width - 16);
      if (nextW === curW) return;
      const centerX = curX + curW / 2;
      const nextX = clamp(
        Math.round(centerX - nextW / 2),
        display.workArea.x + 8,
        display.workArea.x + display.workArea.width - nextW - 8,
      );
      toolbar.setBounds({ x: nextX, y: curY, width: nextW, height: curH }, false);
    }
  });
}
