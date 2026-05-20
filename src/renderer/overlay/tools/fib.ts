import { FIB_LEVELS } from '../../../shared/constants';
import type { FibShape } from '../../../shared/types';
import type { Tool, ToolContext } from './types';
import { nextId } from './types';

function make(ctx: ToolContext, p1: { x: number; y: number }, p2: { x: number; y: number }): FibShape {
  return {
    kind: 'fib',
    id: nextId('fib'),
    p1,
    p2,
    levels: [...FIB_LEVELS],
    color: ctx.settings.color,
    opacity: ctx.settings.opacity,
    showLabels: true,
  };
}

export const fib: Tool = (() => {
  let working: FibShape | null = null;
  let p1: { x: number; y: number } | null = null;

  return {
    id: 'fib',
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
      const final: FibShape = { ...working, p2: { x: sample.x, y: sample.y } };
      working = null;
      p1 = null;
      ctx.setDraft(null);
      if (Math.abs(final.p2.y - final.p1.y) > 4) ctx.commitShapeAndSelect(final);
    },
  };
})();
