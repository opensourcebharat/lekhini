import { globalShortcut, ipcMain, screen } from 'electron';
import { HOTKEYS } from '../shared/constants';
import { getState, patch } from './hub';
import {
  captureFocusedDisplay,
  clearAllSnipSelections,
  copyFocusedSnipToClipboard,
  getFocusedDisplayId,
  getSnipSelection,
  setSnipSelection,
} from './capture';
import { getOverlays } from './windows/overlay';

export function registerHotkeys() {
  // Master toggle: always registered so the user can enter draw mode.
  globalShortcut.register(HOTKEYS.toggleDrawMode, () => {
    patch({ drawMode: !getState().drawMode });
  });

  // Toolbar relay handlers — always callable from the toolbar buttons,
  // regardless of draw mode. The toolbar itself is a normal app window
  // that doesn't steal anything from the OS.
  ipcMain.handle('relay:undo', () => sendToFocusedOverlay('overlay:undo'));
  ipcMain.handle('relay:redo', () => sendToFocusedOverlay('overlay:redo'));
  ipcMain.handle('relay:clear', () => sendToAllOverlays('overlay:clear'));
  ipcMain.handle('capture:trigger', () => captureFocusedDisplay());
  ipcMain.handle('snip:copy', () => copyFocusedSnipToClipboard());
}

export function unregisterHotkeys() {
  globalShortcut.unregisterAll();
}

/**
 * Register / unregister hotkeys that only make sense while drawing.
 * When draw mode is OFF the OS owns these keys again, so the user's
 * focused app (browser / editor / etc.) handles ⌘Z, ⌘⇧S, etc. normally.
 */
export function registerDrawingHotkeys(drawMode: boolean) {
  const keys = [
    HOTKEYS.undo,
    HOTKEYS.redo,
    HOTKEYS.clear,
    HOTKEYS.screenshot,
    HOTKEYS.copySnip,
  ];

  if (!drawMode) {
    for (const k of keys) {
      if (globalShortcut.isRegistered(k)) globalShortcut.unregister(k);
    }
    clearAllSnipSelections();
    return;
  }

  if (!globalShortcut.isRegistered(HOTKEYS.undo)) {
    globalShortcut.register(HOTKEYS.undo, () => sendToFocusedOverlay('overlay:undo'));
  }
  if (!globalShortcut.isRegistered(HOTKEYS.redo)) {
    globalShortcut.register(HOTKEYS.redo, () => sendToFocusedOverlay('overlay:redo'));
  }
  if (!globalShortcut.isRegistered(HOTKEYS.clear)) {
    globalShortcut.register(HOTKEYS.clear, () => sendToAllOverlays('overlay:clear'));
  }
  if (!globalShortcut.isRegistered(HOTKEYS.screenshot)) {
    globalShortcut.register(HOTKEYS.screenshot, () => {
      void captureFocusedDisplay();
    });
  }
  if (!globalShortcut.isRegistered(HOTKEYS.copySnip)) {
    globalShortcut.register(HOTKEYS.copySnip, () => {
      void copyFocusedSnipToClipboard();
    });
  }
}

export function registerEscapeWhileDrawing(drawMode: boolean) {
  const ESC = 'Escape';
  if (drawMode) {
    if (!globalShortcut.isRegistered(ESC)) {
      globalShortcut.register(ESC, () => {
        // If a snip selection exists on the focused display, clear it first.
        const focusedId = getFocusedDisplayId();
        if (getSnipSelection(focusedId)) {
          setSnipSelection(focusedId, null);
          return;
        }
        patch({ drawMode: false });
      });
    }
  } else {
    if (globalShortcut.isRegistered(ESC)) globalShortcut.unregister(ESC);
  }
}

function sendToFocusedOverlay(channel: string) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const win = getOverlays().get(display.id);
  if (win && !win.isDestroyed()) win.webContents.send(channel);
}

function sendToAllOverlays(channel: string) {
  for (const win of getOverlays().values()) {
    if (!win.isDestroyed()) win.webContents.send(channel);
  }
}
