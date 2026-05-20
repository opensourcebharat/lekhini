import type { EllipseShape } from '../../../shared/types';
import type { Tool, ToolContext } from './types';
import { nextId } from './types';

function make(ctx: ToolContext, p1: { x: number; y: number }, p2: { x: number; y: number }): EllipseShape {
  return {
    kind: 'ellipse',
    id: nextId('ellipse'),
    p1,
    p2,
    color: ctx.settings.color,
    width: ctx.settings.width,
    opacity: ctx.settings.opacity,
    fill: false,
  };
}

export const ellipse: Tool = (() => {
  let working: EllipseShape | null = null;
  let p1: { x: number; y: number } | null = null;

  return {
    id: 'ellipse',
    onDown(sample, ctx) {
      p1 = { x: sample.x, y: sample.y };
      working = make(ctx, p1, p1);
      ctx.setDraft(working);
    },
    onMove(samples, ctx) {
      if (!working || !p1) return;
      const s = samples[samples.length - 1];
      working = { ...working, p2: { x: s.x, y: s.y } };
      ctx.setDraft(working);
    },
    onUp(sample, ctx) {
      if (!working || !p1) return;
      const final: EllipseShape = { ...working, p2: { x: sample.x, y: sample.y } };
      working = null;
      p1 = null;
      ctx.setDraft(null);
      const w = Math.abs(final.p2.x - final.p1.x);
      const h = Math.abs(final.p2.y - final.p1.y);
      if (w > 4 && h > 4) ctx.commitShapeAndSelect(final);
    },
  };
})();
