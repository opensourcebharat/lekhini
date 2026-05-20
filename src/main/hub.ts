import { BrowserWindow, ipcMain } from 'electron';
import { DEFAULT_SETTINGS, GRAPHITE_COLOR } from '../shared/constants';
import { DEFAULT_PROFILE } from '../shared/profiles';
import { persisted, PERSISTED_DEFAULTS, save } from './persistence';
import type {
  Calibration,
  HubStateUpdate,
  Orientation,
  PerToolWidth,
  ProfileId,
  Theme,
  ToolId,
  ToolSettings,
  Whiteboard,
} from '../shared/types';

export interface HubState {
  activeTool: ToolId;
  drawMode: boolean;
  settings: ToolSettings;
  calibration: Calibration | null;
  orientation: Orientation;
  minimized: boolean;
  whiteboard: Whiteboard;
  theme: Theme;
  profile: ProfileId;
  settingsOpen: boolean;
  thicknessFlyoutOpen: boolean;
  perToolWidth: PerToolWidth;
}

const state: HubState = {
  activeTool: 'pencil',
  drawMode: false,
  settings: { ...DEFAULT_SETTINGS },
  calibration: null,
  orientation: 'h',
  minimized: false,
  whiteboard: 'off',
  theme: 'dark',
  profile: DEFAULT_PROFILE,
  settingsOpen: false,
  thicknessFlyoutOpen: false,
  perToolWidth: { pencil: 3, pen: 4, eraser: 20, highlighter: 18 },
};

const subscribers = new Set<BrowserWindow>();
const listeners = new Set<(state: HubState, changed: Set<keyof HubState>) => void>();

const TRACKED_TOOLS = new Set<ToolId>(['pencil', 'pen', 'eraser', 'highlighter']);
type TrackedTool = 'pencil' | 'pen' | 'eraser' | 'highlighter';

export function subscribe(win: BrowserWindow) {
  subscribers.add(win);
  win.once('closed', () => subscribers.delete(win));
}

export function onChange(fn: (state: HubState, changed: Set<keyof HubState>) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState(): HubState {
  return state;
}

const VALID_TOOLS = new Set<ToolId>([
  'pencil',
  'pen',
  'highlighter',
  'eraser',
  'hand',
  'line',
  'trendline',
  'fib',
  'region',
  'ellipse',
  'arrow',
  'text',
  'snip',
]);

// Pull persisted values into the initial state. Safe to call multiple times.
// Guards against schema drift: older installs may have persisted records
// without the pencil key in perToolWidth (since pencil didn't exist), or
// with an activeTool the current build no longer recognises. In both
// cases we fall back to defaults so the app stays usable.
export function hydrateFromPersistence(): void {
  const p = persisted();
  state.orientation = p.orientation;
  state.theme = p.theme;
  state.profile = p.profile;
  // Merge stored widths over defaults, only accepting valid numbers per
  // key so stale or partial records don't reintroduce undefined values.
  const storedW = (p.perToolWidth ?? {}) as Partial<typeof PERSISTED_DEFAULTS.perToolWidth>;
  state.perToolWidth = {
    pencil:      typeof storedW.pencil      === 'number' ? storedW.pencil      : PERSISTED_DEFAULTS.perToolWidth.pencil,
    pen:         typeof storedW.pen         === 'number' ? storedW.pen         : PERSISTED_DEFAULTS.perToolWidth.pen,
    eraser:      typeof storedW.eraser      === 'number' ? storedW.eraser      : PERSISTED_DEFAULTS.perToolWidth.eraser,
    highlighter: typeof storedW.highlighter === 'number' ? storedW.highlighter : PERSISTED_DEFAULTS.perToolWidth.highlighter,
  };
  state.activeTool = VALID_TOOLS.has(p.activeTool) ? p.activeTool : 'pencil';
  // If the active tool is pencil, the canonical color is graphite —
  // don't restore a stray non-graphite value from a previous session.
  const colorForTool =
    state.activeTool === 'pencil' ? GRAPHITE_COLOR : p.color;
  const restoredWidth = TRACKED_TOOLS.has(state.activeTool)
    ? state.perToolWidth[state.activeTool as TrackedTool]
    : undefined;
  state.settings = {
    ...state.settings,
    color: colorForTool,
    width: restoredWidth ?? state.settings.width,
  };
}

export function patch(update: HubStateUpdate) {
  const changed = new Set<keyof HubState>();

  if (update.activeTool !== undefined && update.activeTool !== state.activeTool) {
    state.activeTool = update.activeTool;
    changed.add('activeTool');
    save('activeTool', state.activeTool);
    // Switching to a tracked tool (pencil/pen/eraser/highlighter) restores
    // that tool's saved width. Only restore when a real value is stored —
    // never overwrite settings.width with undefined.
    if (TRACKED_TOOLS.has(state.activeTool)) {
      const saved = state.perToolWidth[state.activeTool as TrackedTool];
      if (typeof saved === 'number' && saved !== state.settings.width) {
        state.settings = { ...state.settings, width: saved };
        changed.add('settings');
      }
    } else if (state.thicknessFlyoutOpen) {
      // Switched away from a tool that owns the flyout — close it.
      state.thicknessFlyoutOpen = false;
      changed.add('thicknessFlyoutOpen');
    }
    // Pencil is locked to graphite — selecting it always resets color.
    // This is what makes "change the color → become a pen" a natural,
    // reversible distinction between the two tools.
    if (state.activeTool === 'pencil' && state.settings.color !== GRAPHITE_COLOR) {
      state.settings = { ...state.settings, color: GRAPHITE_COLOR };
      changed.add('settings');
      save('color', GRAPHITE_COLOR);
    }
  }
  if (update.drawMode !== undefined && update.drawMode !== state.drawMode) {
    state.drawMode = update.drawMode;
    changed.add('drawMode');
  }
  if (update.settings) {
    const colorChanged =
      update.settings.color !== undefined && update.settings.color !== state.settings.color;
    state.settings = { ...state.settings, ...update.settings };
    changed.add('settings');
    // If width changed while a tracked tool is active, mirror it into
    // per-tool memory so re-selecting the tool restores this thickness.
    if (
      update.settings.width !== undefined &&
      TRACKED_TOOLS.has(state.activeTool)
    ) {
      const tool = state.activeTool as TrackedTool;
      if (state.perToolWidth[tool] !== update.settings.width) {
        state.perToolWidth = { ...state.perToolWidth, [tool]: update.settings.width };
        changed.add('perToolWidth');
        save('perToolWidth', state.perToolWidth);
      }
    }
    if (update.settings.color !== undefined) {
      save('color', state.settings.color);
    }
    // Pencil is graphite-only. If the user picks any other color while
    // pencil is active, auto-promote to pen — they clearly wanted an
    // inked stroke at that point. Pen's saved width takes effect.
    if (
      colorChanged &&
      state.activeTool === 'pencil' &&
      state.settings.color !== GRAPHITE_COLOR
    ) {
      state.activeTool = 'pen';
      changed.add('activeTool');
      save('activeTool', 'pen');
      const w = state.perToolWidth.pen;
      if (typeof w === 'number' && w !== state.settings.width) {
        state.settings = { ...state.settings, width: w };
      }
    }
  }
  if (update.perToolWidth) {
    state.perToolWidth = { ...state.perToolWidth, ...update.perToolWidth };
    changed.add('perToolWidth');
    save('perToolWidth', state.perToolWidth);
    // If the active tool's width was just updated, mirror into settings.
    if (TRACKED_TOOLS.has(state.activeTool)) {
      const tool = state.activeTool as TrackedTool;
      const w = state.perToolWidth[tool];
      if (typeof w === 'number' && w !== state.settings.width) {
        state.settings = { ...state.settings, width: w };
        changed.add('settings');
      }
    }
  }
  if (update.calibration !== undefined) {
    state.calibration = update.calibration;
    changed.add('calibration');
  }
  if (update.orientation !== undefined && update.orientation !== state.orientation) {
    state.orientation = update.orientation;
    changed.add('orientation');
    save('orientation', state.orientation);
  }
  if (update.minimized !== undefined && update.minimized !== state.minimized) {
    state.minimized = update.minimized;
    changed.add('minimized');
  }
  if (update.whiteboard !== undefined && update.whiteboard !== state.whiteboard) {
    state.whiteboard = update.whiteboard;
    changed.add('whiteboard');
  }
  if (update.theme !== undefined && update.theme !== state.theme) {
    state.theme = update.theme;
    changed.add('theme');
    save('theme', state.theme);
  }
  if (update.profile !== undefined && update.profile !== state.profile) {
    state.profile = update.profile;
    changed.add('profile');
    save('profile', state.profile);
  }
  if (update.settingsOpen !== undefined && update.settingsOpen !== state.settingsOpen) {
    state.settingsOpen = update.settingsOpen;
    changed.add('settingsOpen');
    // Settings and flyout share the side panel slot; only one open at once.
    if (state.settingsOpen && state.thicknessFlyoutOpen) {
      state.thicknessFlyoutOpen = false;
      changed.add('thicknessFlyoutOpen');
    }
  }
  if (
    update.thicknessFlyoutOpen !== undefined &&
    update.thicknessFlyoutOpen !== state.thicknessFlyoutOpen
  ) {
    state.thicknessFlyoutOpen = update.thicknessFlyoutOpen;
    changed.add('thicknessFlyoutOpen');
    if (state.thicknessFlyoutOpen && state.settingsOpen) {
      state.settingsOpen = false;
      changed.add('settingsOpen');
    }
  }
  broadcast(changed);
}

function broadcast(changed: Set<keyof HubState>) {
  for (const win of subscribers) {
    if (!win.isDestroyed()) win.webContents.send('hub:state:broadcast', state);
  }
  for (const fn of listeners) fn(state, changed);
}

export function registerHubIpc() {
  ipcMain.handle('hub:state:get', () => state);
  ipcMain.handle('hub:state:update', (_evt, update: HubStateUpdate) => {
    patch(update);
    return state;
  });
}
