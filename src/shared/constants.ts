import type { ToolId, ToolSettings } from './types';

// Pencil identity — the canonical graphite shade. Selecting pencil forces
// this color; any color change while pencil is active auto-switches the
// tool to pen, which is what the user really wanted at that point.
export const GRAPHITE_COLOR = '#3a3a3c';

export const DEFAULT_SETTINGS: ToolSettings = {
  color: GRAPHITE_COLOR,
  width: 2,
  opacity: 1,
};

export const HIGHLIGHTER_DEFAULT: ToolSettings = {
  color: '#ffeb3b',
  width: 18,
  opacity: 0.4,
};

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];

// Per-level colors for the Fibonacci retracement, matching the
// convention traders are used to on TradingView / MT charts: each
// ratio reads as a distinct hue so levels are identifiable at a glance
// without checking the label. 0 and 1 (the swing endpoints) are
// neutral grey; the inner ratios run warm→cool, with the 0.618 golden
// ratio in its signature teal. Keyed by the ratio's string form.
export const FIB_COLORS: Record<string, string> = {
  '0': '#9598a1', // swing low/high — neutral grey
  '0.236': '#f23645', // red
  '0.382': '#ff9800', // orange
  '0.5': '#4caf50', // green
  '0.618': '#089981', // golden ratio — teal (the key level)
  '0.786': '#2962ff', // blue
  '1': '#9598a1', // full retrace — neutral grey
};

// Color for a given Fibonacci level, falling back to neutral grey for
// any custom level not in the standard palette.
export function fibColor(level: number): string {
  return FIB_COLORS[String(level)] ?? '#9598a1';
}

export const SNAP_ANGLES_DEG = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];

// Default first user message for the auto-fired opening turn of an
// "Ask AI" snip session. The user hasn't typed anything yet — the image
// carries the request — so this is phrased to make the model SOLVE or
// answer whatever is in the image rather than merely describe it. Used
// by every provider adapter when input.userMessage is empty.
export const SOLVE_FIRST_TURN =
  'Solve or answer whatever is shown in this image. If it contains a ' +
  'problem, question, equation, or task, work it out and give the final ' +
  'answer with the key steps — do not just describe what you see.';

// Initial sizes for the toolbar window. The renderer reports its
// actual content size after mount and the window resizes to fit — so
// these values just need to be a generous first-paint estimate close
// to typical content size, minimizing flicker before dynamic resize
// lands. CRITICAL: must be ≥ actual content height including the
// bottom footer, otherwise the footer is clipped below the visible
// window edge until the next state change triggers a remeasure.
// That's what bit users when they restored from the collapsed pill.
//
// Rough budget per orientation (sum to current values with margin):
//   h: titlebar 28 + tools row 56 + footer 28 + borders 2 = ~114
//      → 140 leaves slack for taller tool rows
//   v: v-controls 32 + v-brand 52 + tools ~280 + pinned ~96 +
//      footer 52 + borders 2 = ~514 → 560 with slack
export const TOOLBAR_SIZES = {
  h: { w: 740, h: 140 },
  v: { w: 88, h: 560 },
};

// Extra space added when the settings dropdown is open.
// Horizontal grows downward; vertical grows sideways.
export const SETTINGS_EXTRA = {
  h: { w: 0, h: 260 },
  v: { w: 260, h: 0 },
};

export const TOOLBAR_W = TOOLBAR_SIZES.h.w;
export const TOOLBAR_H = TOOLBAR_SIZES.h.h;

export const HISTORY_LIMIT = 100;

export const HOTKEYS = {
  toggleDrawMode: 'CommandOrControl+Shift+D',
  screenshot: 'CommandOrControl+Shift+S',
  clear: 'CommandOrControl+Shift+C',
  undo: 'CommandOrControl+Z',
  redo: 'CommandOrControl+Shift+Z',
  copySnip: 'CommandOrControl+C',
};

export const TOOL_HOTKEYS: Record<string, ToolId> = {
  q: 'pencil',
  p: 'pen',
  h: 'highlighter',
  e: 'eraser',
  m: 'hand',
  l: 'line',
  t: 'trendline',
  f: 'fib',
  r: 'region',
  o: 'ellipse',
  a: 'arrow',
  x: 'text',
  c: 'snip',
};

// Per-tool thickness presets surfaced in the quick-select flyout.
// Picked so the smallest chip is genuinely fine and the largest is bold,
// with a sane progression in between. Pencil leans fine; pen has a bit
// more body since it reads as ink rather than graphite.
export const THICKNESS_PRESETS: Record<
  'pencil' | 'pen' | 'eraser' | 'highlighter',
  number[]
> = {
  pencil: [0.5, 1, 2, 3, 6],
  pen: [2, 4, 8, 14, 22],
  eraser: [10, 18, 28, 44, 64],
  highlighter: [12, 18, 26, 34, 44],
};

export const COLOR_PRESETS = [
  '#1c1c1e',
  '#ffffff',
  '#e74c3c',
  '#27ae60',
  '#2980b9',
  '#f39c12',
  '#f1c40f',
  '#9b59b6',
  '#16a085',
  '#e67e22',
  '#34495e',
  '#95a5a6',
];
