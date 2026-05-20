import type { Item } from '../../../shared/types';
import type { Tool } from './types';
import { findTopItemAt } from './hitTest';
import { translateItem } from './translate';
import { applyHandle, hitHandle, type HandleId } from '../canvas/handles';

type Drag =
  | { kind: 'body'; id: string; original: Item; startX: number; startY: number }
  | { kind: 'handle'; id: string; hid: HandleId; original: Item };

export const hand: Tool = (() => {
  let drag: Drag | null = null;

  return {
    id: 'hand',
    onDown(sample, ctx) {
      const items = ctx.items();
      const selectedId = ctx.selectedId();

      // 1) Try a handle on the currently-selected item first
      if (selectedId) {
        const sel = items.find((i) => i.id === selectedId);
        if (sel) {
          const hid = hitHandle(sel, sample.x, sample.y, 12);
          if (hid) {
            ctx.snapshot();
            drag = { kind: 'handle', id: sel.id, hid, original: sel };
            return;
          }
        }
      }

      // 2) Otherwise hit-test items for body drag / selection
      const target = findTopItemAt(items, sample.x, sample.y, 12);
      if (target) {
        ctx.setSelected(target.id);
        ctx.snapshot();
        drag = {
          kind: 'body',
          id: target.id,
          original: target,
          startX: sample.x,
          startY: sample.y,
        };
        return;
      }

      // 3) Empty space → deselect
      ctx.setSelected(null);
    },
    onMove(samples, ctx) {
      if (!drag) return;
      const s = samples[samples.length - 1];
      if (drag.kind === 'body') {
        const dx = s.x - drag.startX;
        const dy = s.y - drag.startY;
        ctx.setItem(drag.id, translateItem(drag.original, dx, dy));
      } else {
        ctx.setItem(drag.id, applyHandle(drag.original, drag.hid, s.x, s.y));
      }
    },
    onUp() {
      drag = null;
    },
  };
})();
