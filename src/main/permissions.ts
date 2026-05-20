import { app, BrowserWindow, ipcMain, shell, systemPreferences } from 'electron';
import type { ScreenPermissionStatus } from '../shared/types';

export interface PermissionStatus {
  screen: ScreenPermissionStatus;
  accessibility: boolean;
}

export function check(): PermissionStatus {
  if (process.platform !== 'darwin') {
    // On Windows + X11 there is no permission gate. On Wayland the
    // portal mediates at call time so we still report 'granted' here
    // and let the portal prompt fire when desktopCapturer is invoked.
    return { screen: 'granted', accessibility: true };
  }
  return {
    screen: systemPreferences.getMediaAccessStatus('screen'),
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
  };
}

export function screenStatus(): ScreenPermissionStatus {
  return check().screen;
}

export function open(which: 'screen' | 'accessibility') {
  if (process.platform !== 'darwin') return;
  const urls = {
    screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    accessibility:
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  };
  shell.openExternal(urls[which]);
}

// Broadcast a permission-status update to every renderer that's
// currently alive. Used by onFocusRecheck and by capture.ts when it
// discovers a denial through the capturer's empty-source return.
export function notifyStatus(): void {
  const payload = { screen: screenStatus() };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('permissions:status', payload);
  }
}

// macOS-only: register a one-shot listener that fires the next time
// any of our windows regains focus. The user clicked "Open System
// Settings" in the modal, granted the permission, then alt-tabbed
// back to Lekhini — that focus event is our signal to recheck. The
// listener is auto-cleared after firing so we don't leak handlers
// across modal open/close cycles.
let pendingRecheck: (() => void) | null = null;
export function onFocusRecheck(cb: (status: ScreenPermissionStatus) => void): void {
  // Replace any prior pending callback (no point in stacking).
  pendingRecheck = () => cb(screenStatus());
  const handler = (): void => {
    if (!pendingRecheck) return;
    const fn = pendingRecheck;
    pendingRecheck = null;
    // Defer one tick — macOS sometimes updates TCC state slightly
    // after the focus event fires.
    setTimeout(fn, 120);
  };
  app.once('browser-window-focus', handler);
}

export function registerPermissionsIpc() {
  ipcMain.handle('permissions:check', () => check());
  ipcMain.handle('permissions:open', (_evt, which: 'screen' | 'accessibility') => open(which));
}
