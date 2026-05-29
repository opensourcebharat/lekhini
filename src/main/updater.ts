import { app, BrowserWindow, ipcMain, shell } from 'electron';
// electron-updater is CommonJS; import the default and destructure so the
// ESM↔CJS interop is stable across bundlers.
import electronUpdater from 'electron-updater';
import type { UpdateStatus } from '../shared/types';
import { getState, onChange } from './hub';

const { autoUpdater } = electronUpdater;

// Where users go to grab a build by hand — the manual fallback when
// auto-update can't run (dev, or unsigned macOS where Squirrel refuses
// to apply an update). Derived from package.json's repository field.
const RELEASES_URL = 'https://github.com/opensourcebharat/lekhini/releases/latest';

// Re-check this often while the app stays open, so a long-running
// session still notices a release without a restart.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let status: UpdateStatus = { state: 'idle', currentVersion: '' };

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('updater:status', status);
  }
}

function setStatus(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next };
  broadcast();
}

// Auto-update only works in a packaged build (a dev run has no
// app-update.yml feed) — and on macOS only when the app is signed +
// notarized. We can't cheaply detect signing, so we attempt the check
// and map a signature error to 'unsupported' (the UI then offers a
// manual download link instead of looking broken).
function canUpdate(): boolean {
  return app.isPackaged;
}

function isSignatureError(message: string): boolean {
  return /code sign|signature|not signed|not been signed/i.test(message);
}

async function check(): Promise<void> {
  if (!canUpdate()) return;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    setStatus({ state: isSignatureError(msg) ? 'unsupported' : 'error', message: msg });
  }
}

function wireEvents(): void {
  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking', message: undefined }));
  autoUpdater.on('update-available', (info) =>
    // With autoDownload on, electron-updater is already fetching; reflect
    // that. With it off, we sit at 'available' until the user acts.
    setStatus({
      state: autoUpdater.autoDownload ? 'downloading' : 'available',
      version: info.version,
      percent: 0,
    }),
  );
  autoUpdater.on('update-not-available', () => setStatus({ state: 'none', version: undefined }));
  autoUpdater.on('download-progress', (p) =>
    setStatus({ state: 'downloading', percent: Math.round(p.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    setStatus({ state: 'downloaded', version: info.version, percent: 100 }),
  );
  autoUpdater.on('error', (err) => {
    const msg = (err as Error)?.message ?? String(err);
    setStatus({ state: isSignatureError(msg) ? 'unsupported' : 'error', message: msg });
  });
}

export function initAutoUpdates(): void {
  status = { state: 'idle', currentVersion: app.getVersion() };

  autoUpdater.autoDownload = getState().autoUpdate;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  wireEvents();

  // Live-react to the Settings toggle: flip autoDownload, and if the user
  // just enabled it while an update is already known, start fetching.
  onChange((s, changed) => {
    if (!changed.has('autoUpdate')) return;
    autoUpdater.autoDownload = s.autoUpdate;
    if (s.autoUpdate && status.state === 'available') void check();
  });

  if (!canUpdate()) {
    setStatus({
      state: 'unsupported',
      message: 'Updates apply to installed builds only (you are running from source).',
    });
    return;
  }

  void check();
  setInterval(() => void check(), CHECK_INTERVAL_MS);
}

export function registerUpdaterIpc(): void {
  ipcMain.handle('updater:get', () => status);
  ipcMain.handle('updater:check', async () => {
    await check();
    return status;
  });
  // Apply an update. If it's downloaded, quit + install now; if it's only
  // been detected (autoDownload off), kick off the download — the UI then
  // flips to "Restart to update" once 'update-downloaded' fires.
  ipcMain.handle('updater:install', async () => {
    if (!canUpdate()) return;
    if (status.state === 'downloaded') {
      // Defer so the IPC reply flushes before the app tears down.
      setImmediate(() => autoUpdater.quitAndInstall());
      return;
    }
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      setStatus({ state: isSignatureError(msg) ? 'unsupported' : 'error', message: msg });
    }
  });
  ipcMain.handle('updater:open-releases', () => {
    void shell.openExternal(RELEASES_URL);
  });
}
