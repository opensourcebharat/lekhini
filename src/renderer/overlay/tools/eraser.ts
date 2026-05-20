import type { Item } from '../../../shared/types';
import type { Tool } from './types';
import { itemHit } from './hitTest';

const ERASE_RADIUS = 14;

export const eraser: Tool = {
  id: 'eraser',
  onDown(sample, ctx) {
    ctx.remove((item) => itemHit(item, sample.x, sample.y, ERASE_RADIUS));
  },
  onMove(samples, ctx) {
    for (const s of samples) {
      ctx.remove((item: Item) => itemHit(item, s.x, s.y, ERASE_RADIUS));
    }
  },
  onUp() {
    /* no-op */
  },
};
