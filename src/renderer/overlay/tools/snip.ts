import type { RegionShape } from '../../../shared/types';
import type { Tool } from './types';
import { nextId } from './types';

const PREVIEW_COLOR = '#ffffff';
const PREVIEW_OPACITY = 0.9;

export const snip: Tool = (() => {
  let draft: RegionShape | null = null;
  let anchor: { x: number; y: number } | null = null;

  return {
    id: 'snip',
    onDown(sample, ctx) {
      // Starting a new selection clears any existing one immediately.
      void window.pen.snip.clear({ displayId: window.pen.env.displayId() });

      anchor = { x: sample.x, y: sample.y };
      draft = {
        kind: 'region',
        id: nextId('snip-preview'),
        p1: anchor,
        p2: anchor,
        color: PREVIEW_COLOR,
        opacity: PREVIEW_OPACITY,
      };
      ctx.setDraft(draft);
    },
    onMove(samples, ctx) {
      if (!draft) return;
      const s = samples[samples.length - 1];
      draft = { ...draft, p2: { x: s.x, y: s.y } };
      ctx.setDraft(draft);
    },
    onUp(sample, ctx) {
      if (!anchor) return;
      const start = anchor;
      const end = { x: sample.x, y: sample.y };
      anchor = null;
      draft = null;
      ctx.setDraft(null);

      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      if (w < 4 || h < 4) return;

      void window.pen.snip.set({
        rect: { x, y, w, h },
        displayId: window.pen.env.displayId(),
      });
    },
  };
})();
