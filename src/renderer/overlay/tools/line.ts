import { SNAP_ANGLES_DEG } from '../../../shared/constants';
import type { LineShape } from '../../../shared/types';
import type { Tool, ToolContext } from './types';
import { nextId } from './types';

type Mode = 'horizontal' | 'vertical' | 'trendline';

function makeLine(mode: Mode, ctx: ToolContext, p1: { x: number; y: number }, p2: { x: number; y: number }): LineShape {
  const { color, width, opacity } = ctx.settings;
  return {
    kind: mode === 'trendline' ? 'trendline' : 'line',
    id: nextId(mode),
    p1,
    p2,
    color,
    width,
    opacity,
  };
}

function snapToAngle(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return p2;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const normalized = ((deg % 180) + 180) % 180;
  let nearest = SNAP_ANGLES_DEG[0];
  let bestDiff = Infinity;
  for (const a of SNAP_ANGLES_DEG) {
    const d = Math.abs(normalized - a);
    if (d < bestDiff) {
      bestDiff = d;
      nearest = a;
    }
  }
  const sign = Math.sign(deg) || 1;
  const finalDeg = sign >= 0 ? nearest : -nearest;
  const rad = (finalDeg * Math.PI) / 180;
  return { x: p1.x + Math.cos(rad) * len, y: p1.y + Math.sin(rad) * len };
}

export function makeLineTool(mode: Mode): Tool {
  let working: LineShape | null = null;
  let p1: { x: number; y: number } | null = null;

  const project = (mode: Mode, p1: { x: number; y: number }, x: number, y: number, shift: boolean) => {
    if (mode === 'horizontal') return { x, y: p1.y };
    if (mode === 'vertical') return { x: p1.x, y };
    if (shift) return snapToAngle(p1, { x, y });
    return { x, y };
  };

  return {
    id: mode,
    onDown(sample, ctx) {
      p1 = { x: sample.x, y: sample.y };
      working = makeLine(mode, ctx, p1, p1);
      ctx.setDraft(working);
    },
    onMove(samples, ctx) {
      if (!working || !p1) return;
      const s = samples[samples.length - 1];
      const p2 = project(mode, p1, s.x, s.y, s.shift);
      working = { ...working, p2 };
      ctx.setDraft(working);
    },
    onUp(sample, ctx) {
      if (!working || !p1) return;
      const p2 = project(mode, p1, sample.x, sample.y, sample.shift);
      const final = { ...working, p2 };
      working = null;
      p1 = null;
      ctx.setDraft(null);
      if (Math.hypot(final.p2.x - final.p1.x, final.p2.y - final.p1.y) > 2) {
        ctx.commitShapeAndSelect(final);
      }
    },
  };
}
