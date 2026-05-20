import { createStore } from 'zustand/vanilla';
import { HISTORY_LIMIT } from '../../shared/constants';
import type { Item, ToolId, ToolSettings } from '../../shared/types';

export interface SnipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverlayState {
  items: Item[];
  past: Item[][];
  future: Item[][];
  activeTool: ToolId;
  drawMode: boolean;
  settings: ToolSettings;
  selectedId: string | null;
  snipRect: SnipRect | null;
}

interface OverlayActions {
  commit(item: Item): void;
  replace(itemId: string, next: Item): void;
  remove(itemId: string): void;
  setItem(itemId: string, next: Item): void;
  snapshot(): void;
  undo(): void;
  redo(): void;
  clear(): void;
  setActiveTool(tool: ToolId): void;
  setDrawMode(on: boolean): void;
  setSettings(patch: Partial<ToolSettings>): void;
  setSelected(id: string | null): void;
  setSnipRect(rect: SnipRect | null): void;
}

export type Store = OverlayState & OverlayActions;

export const store = createStore<Store>((set, get) => ({
  items: [],
  past: [],
  future: [],
  activeTool: 'pencil',
  drawMode: false,
  settings: { color: '#3a3a3c', width: 3, opacity: 1 },
  selectedId: null,
  snipRect: null,

  commit(item) {
    const { items, past } = get();
    const nextPast = [...past, items].slice(-HISTORY_LIMIT);
    set({ items: [...items, item], past: nextPast, future: [] });
  },

  replace(itemId, next) {
    const { items, past } = get();
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx === -1) return;
    const nextItems = [...items];
    nextItems[idx] = next;
    const nextPast = [...past, items].slice(-HISTORY_LIMIT);
    set({ items: nextItems, past: nextPast, future: [] });
  },

  remove(itemId) {
    const { items, past } = get();
    const nextItems = items.filter((i) => i.id !== itemId);
    if (nextItems.length === items.length) return;
    const nextPast = [...past, items].slice(-HISTORY_LIMIT);
    set({ items: nextItems, past: nextPast, future: [] });
  },

  setItem(itemId, next) {
    const { items } = get();
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx === -1) return;
    const nextItems = [...items];
    nextItems[idx] = next;
    set({ items: nextItems });
  },

  snapshot() {
    const { items, past } = get();
    set({ past: [...past, items].slice(-HISTORY_LIMIT), future: [] });
  },

  undo() {
    const { past, items, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      items: prev,
      past: past.slice(0, -1),
      future: [items, ...future].slice(0, HISTORY_LIMIT),
    });
  },

  redo() {
    const { past, items, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      items: next,
      past: [...past, items].slice(-HISTORY_LIMIT),
      future: future.slice(1),
    });
  },

  clear() {
    const { items, past } = get();
    if (items.length === 0) return;
    set({ items: [], past: [...past, items].slice(-HISTORY_LIMIT), future: [] });
  },

  setActiveTool(tool) {
    set({ activeTool: tool });
  },

  setDrawMode(on) {
    set({ drawMode: on });
  },

  setSettings(patch) {
    set({ settings: { ...get().settings, ...patch } });
  },

  setSelected(id) {
    if (get().selectedId === id) return;
    set({ selectedId: id });
  },

  setSnipRect(rect) {
    set({ snipRect: rect });
  },
}));
