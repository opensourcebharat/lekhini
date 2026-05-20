import { ipcMain, shell, systemPreferences } from 'electron';

export interface PermissionStatus {
  screen: 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown';
  accessibility: boolean;
}

export function check(): PermissionStatus {
  if (process.platform !== 'darwin') {
    return { screen: 'granted', accessibility: true };
  }
  return {
    screen: systemPreferences.getMediaAccessStatus('screen'),
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
  };
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

export function registerPermissionsIpc() {
  ipcMain.handle('permissions:check', () => check());
  ipcMain.handle('permissions:open', (_evt, which: 'screen' | 'accessibility') => open(which));
}
