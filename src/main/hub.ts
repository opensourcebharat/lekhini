import { BrowserWindow, ipcMain } from 'electron';
import { DEFAULT_SETTINGS, GRAPHITE_COLOR } from '../shared/constants';
import { DEFAULT_PROFILE } from '../shared/profiles';
import { GROUPS, GROUP_DEFAULTS, GROUP_IDS, groupOf } from '../shared/toolGroups';
import { persisted, PERSISTED_DEFAULTS, save } from './persistence';
import type {
  AiProfileModels,
  Calibration,
  FlyoutId,
  GroupId,
  HubStateUpdate,
  Orientation,
  PerToolWidth,
  ProfileId,
  ProviderId,
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
  // Open flyout card (draw / shapes / color), null when none. Transient
  // — never persisted. Main grows the toolbar window while one is open.
  flyout: FlyoutId | null;
  // Last-used tool per toolbar group. Persisted; updated centrally in
  // patch() whenever activeTool lands on a grouped tool, so hotkeys,
  // overlay-driven changes, and toolbar clicks all keep the group
  // buttons honest.
  groupLastTool: Partial<Record<GroupId, ToolId>>;
  perToolWidth: PerToolWidth;
  saveDir: string | null;
  alwaysAskSavePath: boolean;
  // Whether the renderer is currently showing the status side panel
  // (permission / save error). Transient — never persisted. Tracked
  // in hub so main can grow the toolbar window to fit, the same way
  // it does for settingsOpen.
  statusPanelOpen: boolean;
  // AI chat panel visibility — transient like statusPanelOpen.
  // Mutually exclusive with settingsOpen + statusPanelOpen at the
  // dock slot level.
  chatOpen: boolean;
  // Persisted AI configuration mirrored into the hub so renderers
  // can subscribe via the existing hub.onBroadcast pipe.
  aiActiveProvider: ProviderId | null;
  aiActiveModel: string | null;
  aiProfilePrompts: Partial<Record<ProfileId, string>>;
  // Local-first (Ollama) AI configuration, mirrored from persistence.
  aiLocalEnabled: boolean;
  aiInstalledModels: string[];
  aiLocalModel: string | null;
  aiLocalVisionModel: string | null;
  aiProfileModels: AiProfileModels;
  autocorrectTyped: boolean;
  autocorrectDrawn: boolean;
  defaultTextFont: string;
  aiOnboarded: boolean;
  autoUpdate: boolean;
}

const state: HubState = {
  activeTool: 'pencil',
  drawMode: false,
  settings: { ...DEFAULT_SETTINGS },
  calibration: null,
  orientation: 'h',
  minimized: false,
  whiteboard: 'off',
  theme: 'light',
  profile: DEFAULT_PROFILE,
  settingsOpen: false,
  flyout: null,
  groupLastTool: { ...GROUP_DEFAULTS },
  perToolWidth: { pencil: 3, pen: 4, eraser: 20, highlighter: 18 },
  saveDir: null,
  alwaysAskSavePath: false,
  statusPanelOpen: false,
  chatOpen: false,
  aiActiveProvider: null,
  aiActiveModel: null,
  aiProfilePrompts: {},
  aiLocalEnabled: false,
  aiInstalledModels: [],
  aiLocalModel: null,
  aiLocalVisionModel: null,
  aiProfileModels: {},
  autocorrectTyped: false,
  autocorrectDrawn: false,
  defaultTextFont: 'system-ui, -apple-system, sans-serif',
  aiOnboarded: false,
  autoUpdate: true,
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
  // Last-used tool per group — schema-tolerant: accept only known group
  // keys whose value is actually a member of that group; anything else
  // (older installs, drifted records) falls back to the default.
  const storedG = (p.groupLastTool ?? {}) as Partial<Record<GroupId, ToolId>>;
  const validG: Partial<Record<GroupId, ToolId>> = { ...GROUP_DEFAULTS };
  for (const gid of GROUP_IDS) {
    const t = storedG[gid];
    if (t && GROUPS[gid].includes(t)) validG[gid] = t;
  }
  state.groupLastTool = validG;
  // Save destination: null until the user picks one. Schema-tolerant —
  // older installs without this key fall through to the default.
  state.saveDir = typeof p.saveDir === 'string' ? p.saveDir : null;
  state.alwaysAskSavePath = typeof p.alwaysAskSavePath === 'boolean' ? p.alwaysAskSavePath : false;
  // AI config — schema-tolerant: missing fields fall back to null /
  // empty so old installs upgrade cleanly when they first launch the
  // build with AI integration.
  state.aiActiveProvider =
    p.aiActiveProvider === 'anthropic' ||
    p.aiActiveProvider === 'openai' ||
    p.aiActiveProvider === 'gemini' ||
    p.aiActiveProvider === 'deepseek' ||
    p.aiActiveProvider === 'sarvam' ||
    p.aiActiveProvider === 'ollama'
      ? p.aiActiveProvider
      : null;
  state.aiActiveModel = typeof p.aiActiveModel === 'string' ? p.aiActiveModel : null;
  state.aiProfilePrompts =
    p.aiProfilePrompts && typeof p.aiProfilePrompts === 'object' ? p.aiProfilePrompts : {};
  // Local AI — schema-tolerant for installs that predate it.
  state.aiLocalEnabled = typeof p.aiLocalEnabled === 'boolean' ? p.aiLocalEnabled : false;
  state.aiInstalledModels = Array.isArray(p.aiInstalledModels)
    ? p.aiInstalledModels.filter((m): m is string => typeof m === 'string')
    : [];
  state.aiLocalModel = typeof p.aiLocalModel === 'string' ? p.aiLocalModel : null;
  state.aiLocalVisionModel = typeof p.aiLocalVisionModel === 'string' ? p.aiLocalVisionModel : null;
  state.aiProfileModels =
    p.aiProfileModels && typeof p.aiProfileModels === 'object' ? p.aiProfileModels : {};
  state.autocorrectTyped = typeof p.autocorrectTyped === 'boolean' ? p.autocorrectTyped : false;
  state.autocorrectDrawn = typeof p.autocorrectDrawn === 'boolean' ? p.autocorrectDrawn : false;
  state.defaultTextFont =
    typeof p.defaultTextFont === 'string' && p.defaultTextFont.length > 0
      ? p.defaultTextFont
      : PERSISTED_DEFAULTS.defaultTextFont;
  state.aiOnboarded = typeof p.aiOnboarded === 'boolean' ? p.aiOnboarded : false;
  // Default ON when absent (older installs predate auto-update).
  state.autoUpdate = typeof p.autoUpdate === 'boolean' ? p.autoUpdate : true;
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
    }
    // Remember the pick on its group so the group button shows it —
    // centralised here so hotkeys / overlay / toolbar all count.
    const group = groupOf(state.activeTool);
    if (group && state.groupLastTool[group] !== state.activeTool) {
      state.groupLastTool = { ...state.groupLastTool, [group]: state.activeTool };
      changed.add('groupLastTool');
      save('groupLastTool', state.groupLastTool);
    }
    // A tool pick closes any open tool-group flyout (the color flyout
    // stays — its palette applies to every tool).
    if (state.flyout === 'draw' || state.flyout === 'shapes') {
      state.flyout = null;
      changed.add('flyout');
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
    // The dock slot holds AT MOST ONE of: settings, status panel,
    // chat panel, thickness flyout. Opening settings closes the rest.
    if (state.settingsOpen) {
      if (state.flyout !== null) {
        state.flyout = null;
        changed.add('flyout');
      }
      if (state.statusPanelOpen) {
        state.statusPanelOpen = false;
        changed.add('statusPanelOpen');
      }
      if (state.chatOpen) {
        state.chatOpen = false;
        changed.add('chatOpen');
      }
    }
  }
  if (update.flyout !== undefined && update.flyout !== state.flyout) {
    state.flyout = update.flyout;
    changed.add('flyout');
    // Flyouts and the dock-slot panels are mutually exclusive — both
    // grow the window width in v-mode and would fight over it.
    if (state.flyout !== null) {
      if (state.settingsOpen) {
        state.settingsOpen = false;
        changed.add('settingsOpen');
      }
      if (state.statusPanelOpen) {
        state.statusPanelOpen = false;
        changed.add('statusPanelOpen');
      }
      if (state.chatOpen) {
        state.chatOpen = false;
        changed.add('chatOpen');
      }
    }
  }
  if (update.saveDir !== undefined && update.saveDir !== state.saveDir) {
    state.saveDir = update.saveDir;
    changed.add('saveDir');
    save('saveDir', state.saveDir);
  }
  if (
    update.alwaysAskSavePath !== undefined &&
    update.alwaysAskSavePath !== state.alwaysAskSavePath
  ) {
    state.alwaysAskSavePath = update.alwaysAskSavePath;
    changed.add('alwaysAskSavePath');
    save('alwaysAskSavePath', state.alwaysAskSavePath);
  }
  if (
    update.statusPanelOpen !== undefined &&
    update.statusPanelOpen !== state.statusPanelOpen
  ) {
    state.statusPanelOpen = update.statusPanelOpen;
    changed.add('statusPanelOpen');
    // Mutex with the other dock-slot panels.
    if (state.statusPanelOpen) {
      if (state.settingsOpen) {
        state.settingsOpen = false;
        changed.add('settingsOpen');
      }
      if (state.chatOpen) {
        state.chatOpen = false;
        changed.add('chatOpen');
      }
      if (state.flyout !== null) {
        state.flyout = null;
        changed.add('flyout');
      }
    }
  }
  if (update.chatOpen !== undefined && update.chatOpen !== state.chatOpen) {
    state.chatOpen = update.chatOpen;
    changed.add('chatOpen');
    // Mutex with the other dock-slot panels.
    if (state.chatOpen) {
      if (state.settingsOpen) {
        state.settingsOpen = false;
        changed.add('settingsOpen');
      }
      if (state.statusPanelOpen) {
        state.statusPanelOpen = false;
        changed.add('statusPanelOpen');
      }
      if (state.flyout !== null) {
        state.flyout = null;
        changed.add('flyout');
      }
    }
  }
  if (
    update.aiActiveProvider !== undefined &&
    update.aiActiveProvider !== state.aiActiveProvider
  ) {
    state.aiActiveProvider = update.aiActiveProvider;
    changed.add('aiActiveProvider');
    save('aiActiveProvider', state.aiActiveProvider);
  }
  if (update.aiActiveModel !== undefined && update.aiActiveModel !== state.aiActiveModel) {
    state.aiActiveModel = update.aiActiveModel;
    changed.add('aiActiveModel');
    save('aiActiveModel', state.aiActiveModel);
  }
  if (update.aiProfilePrompts !== undefined) {
    // Merge — caller can patch a single profile's override without
    // wiping the others. Empty-string entry removes the override.
    const merged = { ...state.aiProfilePrompts, ...update.aiProfilePrompts };
    for (const key of Object.keys(merged) as ProfileId[]) {
      const v = merged[key];
      if (typeof v !== 'string' || v.length === 0) delete merged[key];
    }
    state.aiProfilePrompts = merged;
    changed.add('aiProfilePrompts');
    save('aiProfilePrompts', state.aiProfilePrompts);
  }
  if (update.aiLocalEnabled !== undefined && update.aiLocalEnabled !== state.aiLocalEnabled) {
    state.aiLocalEnabled = update.aiLocalEnabled;
    changed.add('aiLocalEnabled');
    save('aiLocalEnabled', state.aiLocalEnabled);
  }
  if (update.aiInstalledModels !== undefined) {
    state.aiInstalledModels = update.aiInstalledModels.filter(
      (m): m is string => typeof m === 'string',
    );
    changed.add('aiInstalledModels');
    save('aiInstalledModels', state.aiInstalledModels);
  }
  if (update.aiLocalModel !== undefined && update.aiLocalModel !== state.aiLocalModel) {
    state.aiLocalModel = update.aiLocalModel;
    changed.add('aiLocalModel');
    save('aiLocalModel', state.aiLocalModel);
  }
  if (
    update.aiLocalVisionModel !== undefined &&
    update.aiLocalVisionModel !== state.aiLocalVisionModel
  ) {
    state.aiLocalVisionModel = update.aiLocalVisionModel;
    changed.add('aiLocalVisionModel');
    save('aiLocalVisionModel', state.aiLocalVisionModel);
  }
  if (update.aiProfileModels !== undefined) {
    // Deep-merge per profile so a single profile's text/vision pick can
    // be patched without wiping the rest. An empty string clears that
    // slot back to the catalogue default.
    const merged: AiProfileModels = { ...state.aiProfileModels };
    for (const key of Object.keys(update.aiProfileModels) as ProfileId[]) {
      const incoming = update.aiProfileModels[key] ?? {};
      const slot = { ...merged[key], ...incoming };
      if (slot.text === '') delete slot.text;
      if (slot.vision === '') delete slot.vision;
      if (slot.text === undefined && slot.vision === undefined) delete merged[key];
      else merged[key] = slot;
    }
    state.aiProfileModels = merged;
    changed.add('aiProfileModels');
    save('aiProfileModels', state.aiProfileModels);
  }
  if (update.autocorrectTyped !== undefined && update.autocorrectTyped !== state.autocorrectTyped) {
    state.autocorrectTyped = update.autocorrectTyped;
    changed.add('autocorrectTyped');
    save('autocorrectTyped', state.autocorrectTyped);
  }
  if (update.autocorrectDrawn !== undefined && update.autocorrectDrawn !== state.autocorrectDrawn) {
    state.autocorrectDrawn = update.autocorrectDrawn;
    changed.add('autocorrectDrawn');
    save('autocorrectDrawn', state.autocorrectDrawn);
  }
  if (
    update.defaultTextFont !== undefined &&
    update.defaultTextFont !== state.defaultTextFont &&
    update.defaultTextFont.length > 0
  ) {
    state.defaultTextFont = update.defaultTextFont;
    changed.add('defaultTextFont');
    save('defaultTextFont', state.defaultTextFont);
  }
  if (update.aiOnboarded !== undefined && update.aiOnboarded !== state.aiOnboarded) {
    state.aiOnboarded = update.aiOnboarded;
    changed.add('aiOnboarded');
    save('aiOnboarded', state.aiOnboarded);
  }
  if (update.autoUpdate !== undefined && update.autoUpdate !== state.autoUpdate) {
    state.autoUpdate = update.autoUpdate;
    changed.add('autoUpdate');
    save('autoUpdate', state.autoUpdate);
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
