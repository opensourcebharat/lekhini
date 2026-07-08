import { PROFILES } from './profiles';
import type { GroupId, ProfileId, ToolId } from './types';

// Tool groups: related tools collapse behind a single toolbar button
// (Epic Pen style). The button shows the group's last-used tool and a
// corner triangle; a flyout exposes the other members. Shared between
// the renderer (rendering/grouping) and main's hub (groupLastTool
// bookkeeping + hydration validation).
export const GROUPS: Record<GroupId, ToolId[]> = {
  draw: ['pencil', 'pen', 'highlighter'],
  shapes: ['line', 'trendline', 'arrow', 'region', 'ellipse', 'fib'],
};

export const GROUP_IDS = Object.keys(GROUPS) as GroupId[];

// Sensible first-run picks: pen is the everyday drawing tool, line the
// most common shape.
export const GROUP_DEFAULTS: Record<GroupId, ToolId> = {
  draw: 'pen',
  shapes: 'line',
};

const GROUP_OF: Partial<Record<ToolId, GroupId>> = {};
for (const gid of GROUP_IDS) {
  for (const tool of GROUPS[gid]) GROUP_OF[tool] = gid;
}

// The group a tool belongs to, or null for ungrouped tools (eraser,
// hand, text, snip…).
export function groupOf(tool: ToolId): GroupId | null {
  return GROUP_OF[tool] ?? null;
}

// Group members available under a profile, in group order. Empty when
// the profile excludes the whole group.
export function groupToolsForProfile(group: GroupId, profile: ProfileId): ToolId[] {
  const allowed = new Set(PROFILES[profile].tools);
  return GROUPS[group].filter((t) => allowed.has(t));
}
