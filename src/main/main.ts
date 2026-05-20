import { app, screen } from 'electron';
import { getState, hydrateFromPersistence, onChange, registerHubIpc } from './hub';
import { initPersistence } from './persistence';
import {
  createOverlayForDisplay,
  registerOverlayIpc,
  setDrawMode,
  syncOverlaysToDisplays,
} from './windows/overlay';
import { createToolbar, getToolbar, registerToolbarIpc, resizeToolbar } from './windows/toolbar';
import { registerPermissionsIpc } from './permissions';
import { registerCaptureIpc } from './capture';
import {
  registerDrawingHotkeys,
  registerEscapeWhileDrawing,
  registerHotkeys,
  unregisterHotkeys,
} from './hotkeys';

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const isDev = !!process.env.VITE_DEV_SERVER_URL;

if (process.platform === 'darwin' && !isDev) {
  app.dock?.hide();
}

app.whenReady().then(async () => {
  console.log('[pen] app ready, displays:', screen.getAllDisplays().length);

  await initPersistence();
  hydrateFromPersistence();

  registerHubIpc();
  registerOverlayIpc();
  registerPermissionsIpc();
  registerCaptureIpc();
  registerToolbarIpc();

  for (const display of screen.getAllDisplays()) {
    console.log('[pen] creating overlay for display', display.id, display.bounds);
    createOverlayForDisplay(display);
  }
  console.log('[pen] creating toolbar window');
  createToolbar(getState().orientation);

  screen.on('display-added', syncOverlaysToDisplays);
  screen.on('display-removed', syncOverlaysToDisplays);
  screen.on('display-metrics-changed', syncOverlaysToDisplays);

  registerHotkeys();

  onChange((state, changed) => {
    if (changed.has('drawMode')) {
      console.log('[pen] drawMode ->', state.drawMode);
      setDrawMode(state.drawMode);
      const tb = getToolbar();
      if (tb && !tb.isDestroyed()) tb.moveTop();
      registerEscapeWhileDrawing(state.drawMode);
      registerDrawingHotkeys(state.drawMode);
    }
    // The status panel (permission / save error) occupies the same
    // dock slot as Settings in the toolbar, so we treat either being
    // open as "the side panel is showing" for window-resize purposes.
    const sidePanelOpen = state.settingsOpen || state.statusPanelOpen;
    if (changed.has('orientation')) {
      resizeToolbar(state.orientation, state.minimized, sidePanelOpen, 'default');
    } else if (
      changed.has('minimized') ||
      changed.has('settingsOpen') ||
      changed.has('statusPanelOpen')
    ) {
      resizeToolbar(state.orientation, state.minimized, sidePanelOpen, 'keep');
    }
  });

  console.log('[pen] startup complete');
});

app.on('will-quit', () => {
  unregisterHotkeys();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
