import { GRAPHITE_COLOR } from '../shared/constants';
import type { Orientation, ProfileId, Theme, ToolId } from '../shared/types';

export interface PersistedState {
  orientation: Orientation;
  theme: Theme;
  profile: ProfileId;
  perToolWidth: { pencil: number; pen: number; eraser: number; highlighter: number };
  color: string;
  activeTool: ToolId;
  // Save destination for screenshot / snip PNGs. `null` until the
  // first save — the first save shows the OS dialog so the user
  // explicitly picks a folder; that folder is then remembered and
  // subsequent saves go straight to it with a timestamped filename.
  saveDir: string | null;
  // If true, every save shows the OS dialog regardless of saveDir.
  // Off by default — the "remember + auto-save" UX is the recommended
  // path. Lives in Settings → File save.
  alwaysAskSavePath: boolean;
}

export const PERSISTED_DEFAULTS: PersistedState = {
  // First-run default is vertical, per design ask. Users can flip to
  // horizontal in Settings and that choice is then remembered.
  orientation: 'v',
  theme: 'dark',
  profile: 'general',
  perToolWidth: { pencil: 2, pen: 4, eraser: 20, highlighter: 18 },
  color: GRAPHITE_COLOR,
  activeTool: 'pencil',
  saveDir: null,
  alwaysAskSavePath: false,
};

interface MinimalStore {
  get<K extends keyof PersistedState>(key: K): PersistedState[K];
  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void;
  store: PersistedState;
}

let store: MinimalStore | null = null;
let pending: PersistedState = { ...PERSISTED_DEFAULTS };
let ready = false;

// electron-store v10 is ESM-only; the main bundle is CJS. Dynamic import
// keeps it loadable without changing the whole build to ESM.
export async function initPersistence(): Promise<PersistedState> {
  try {
    const mod = await import('electron-store');
    const Ctor = (mod.default ?? mod) as new (opts: {
      name?: string;
      defaults: PersistedState;
    }) => MinimalStore;
    // No explicit name → electron-store defaults to `config.json` in
    // the app's user-data directory. That directory is named after
    // productName ("Lekhini"), so the storage path becomes
    // `…/Lekhini/config.json`.
    store = new Ctor({ defaults: PERSISTED_DEFAULTS });
    pending = { ...PERSISTED_DEFAULTS, ...store.store };
    ready = true;
    return pending;
  } catch (err) {
    console.warn('[pen] persistence init failed; running in-memory only', err);
    ready = true;
    return pending;
  }
}

export function persisted(): PersistedState {
  return pending;
}

export function save<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
  pending = { ...pending, [key]: value };
  if (!ready || !store) return;
  store.set(key, value);
}
