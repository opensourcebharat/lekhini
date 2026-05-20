import type { ArrowShape } from '../../../shared/types';
import type { Tool, ToolContext } from './types';
import { nextId } from './types';

function make(ctx: ToolContext, p1: { x: number; y: number }, p2: { x: number; y: number }): ArrowShape {
  return {
    kind: 'arrow',
    id: nextId('arrow'),
    p1,
    p2,
    color: ctx.settings.color,
    width: ctx.settings.width,
  };
}

export const arrow: Tool = (() => {
  let working: ArrowShape | null = null;
  let p1: { x: number; y: number } | null = null;

  return {
    id: 'arrow',
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
      const final: ArrowShape = { ...working, p2: { x: sample.x, y: sample.y } };
      working = null;
      p1 = null;
      ctx.setDraft(null);
      if (Math.hypot(final.p2.x - final.p1.x, final.p2.y - final.p1.y) > 4) ctx.commitShapeAndSelect(final);
    },
  };
})();
