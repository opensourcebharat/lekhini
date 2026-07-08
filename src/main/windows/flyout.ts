import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import { getState, patch, subscribe } from '../hub';
import { getToolbar } from './toolbar';

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// The flyout child window: hosts whichever submenu card is open (draw
// tools / shapes / color+thickness) so the toolbar window's bounds
// never change when a submenu opens — the bar stays perfectly still
// and the card simply appears beside it.
let flyout: BrowserWindow | null = null;

// Anchor rect (relative to the toolbar window) of the button that
// opened the current flyout — reported by the toolbar renderer just
// before it patches hub.flyout.
let anchor = { x: 8, y: 8, w: 40, h: 40 };

// True between "hub.flyout became non-null" and the flyout page's
// first size report for it — we only show the window once it is sized,
// so the user never sees a wrongly-sized flash.
let pendingShow = false;

function createFlyoutWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 220,
    height: 56,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver', 3);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (!process.env.LEKHINI_CAPTURE_TOOLBAR) win.setContentProtection(true);

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(`${VITE_DEV_SERVER_URL}src/renderer/flyout/index.html`);
  } else {
    win.loadFile(path.join(__dirname, '../../dist/src/renderer/flyout/index.html'));
  }

  // Clicking away into another app dismisses the open card (the
  // toolbar renderer separately handles clicks inside the toolbar).
  win.on('blur', () => {
    if (getState().flyout !== null) patch({ flyout: null });
  });

  subscribe(win);
  win.once('closed', () => (flyout = null));
  return win;
}

function ensureWindow(): BrowserWindow {
  if (!flyout || flyout.isDestroyed()) flyout = createFlyoutWindow();
  return flyout;
}

// Place the sized window beside the anchor button: next to the bar in
// v-mode (growing toward the screen center), below it in h-mode.
function position(w: number, h: number): { x: number; y: number } {
  const tb = getToolbar();
  const gap = 8;
  if (!tb || tb.isDestroyed()) return { x: 8, y: 8 };
  const b = tb.getBounds();
  const display = screen.getDisplayNearestPoint({ x: b.x, y: b.y });
  const wa = display.workArea;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  if (getState().orientation === 'v') {
    const barCenter = b.x + b.width / 2;
    const growLeft = barCenter > wa.x + wa.width / 2;
    const x = growLeft ? b.x - gap - w : b.x + b.width + gap;
    const y = clamp(b.y + anchor.y + anchor.h / 2 - h / 2, wa.y + 8, wa.y + wa.height - h - 8);
    return { x: clamp(x, wa.x + 8, wa.x + wa.width - w - 8), y };
  }
  const x = clamp(b.x + anchor.x + anchor.w / 2 - w / 2, wa.x + 8, wa.x + wa.width - w - 8);
  const y = clamp(b.y + b.height + gap, wa.y + 8, wa.y + wa.height - h - 8);
  return { x, y };
}

// Called from main.ts whenever hub.flyout changes.
export function syncFlyoutWindow(open: boolean): void {
  if (open) {
    ensureWindow();
    pendingShow = true;
    // Sizing + showing happens on the page's flyout:set-size report —
    // the card must render its new content before we can fit it.
  } else {
    pendingShow = false;
    if (flyout && !flyout.isDestroyed() && flyout.isVisible()) flyout.hide();
  }
}

export function registerFlyoutIpc(): void {
  ipcMain.handle('flyout:anchor', (_evt, rect: { x: number; y: number; w: number; h: number }) => {
    anchor = rect;
  });
  ipcMain.handle('flyout:set-size', (_evt, size: { w: number; h: number }) => {
    if (!flyout || flyout.isDestroyed()) return;
    if (getState().flyout === null) return; // stale report after close
    const { x, y } = position(size.w, size.h);
    flyout.setBounds({ x, y, width: size.w, height: size.h }, false);
    if (pendingShow) {
      pendingShow = false;
      // showInactive: the card appears without stealing focus from
      // whatever app the user is annotating.
      flyout.showInactive();
    }
  });
}
