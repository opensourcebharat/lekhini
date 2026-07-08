import { Icons } from './icons';
import type { ToolId } from '../../shared/types';

export interface ToolDef {
  id: ToolId;
  label: string;
  hint: string;
  icon: () => ReturnType<(typeof Icons)['pen']>;
}

export const ALL_TOOLS: ToolDef[] = [
  { id: 'pencil',      label: 'Pencil',      hint: 'Q',          icon: Icons.pencil },
  { id: 'pen',         label: 'Pen',         hint: 'P',          icon: Icons.pen },
  { id: 'eraser',      label: 'Eraser',      hint: 'E',          icon: Icons.eraser },
  { id: 'hand',        label: 'Hand (move)', hint: 'M',          icon: Icons.hand },
  { id: 'highlighter', label: 'Highlighter', hint: 'H',          icon: Icons.highlighter },
  { id: 'line',        label: 'H/V Line',    hint: 'L',          icon: Icons.line },
  { id: 'trendline',   label: 'Trendline',   hint: 'T · ⇧ snap', icon: Icons.trendline },
  { id: 'arrow',       label: 'Arrow',       hint: 'A',          icon: Icons.arrow },
  { id: 'text',        label: 'Text',        hint: 'X',          icon: Icons.text },
  { id: 'region',      label: 'Rectangle',   hint: 'R',          icon: Icons.region },
  { id: 'ellipse',     label: 'Ellipse',     hint: 'O',          icon: Icons.ellipse },
  { id: 'fib',         label: 'Fibonacci',   hint: 'F',          icon: Icons.fib },
  { id: 'snip',        label: 'Snip',        hint: 'C · ⇧ save', icon: Icons.snip },
];

export const TOOL_BY_ID: Record<ToolId, ToolDef> = ALL_TOOLS.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<ToolId, ToolDef>,
);

// ⌘/⇧ glyphs mean nothing off macOS — spell the keys out there.
const IS_MAC = /mac/i.test(navigator.platform);
export const toolHint = (hint: string): string =>
  IS_MAC ? hint : hint.replace('⇧', 'Shift');
