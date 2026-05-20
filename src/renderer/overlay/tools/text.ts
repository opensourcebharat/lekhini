import type { TextShape } from '../../../shared/types';
import type { Tool } from './types';
import { nextId } from './types';

export const text: Tool = {
  id: 'text',
  onDown(sample, ctx) {
    void ctx.requestFocus().then(() => {
      ctx.promptText({ x: sample.x, y: sample.y }, (value: string) => {
        void ctx.releaseFocus();
        if (!value.trim()) return;
        const item: TextShape = {
          kind: 'text',
          id: nextId('text'),
          at: { x: sample.x, y: sample.y },
          text: value,
          color: ctx.settings.color,
          fontSize: Math.max(14, Math.round(ctx.settings.width * 4)),
        };
        ctx.commit(item);
      });
    });
  },
  onMove() {
    /* no-op */
  },
  onUp() {
    /* no-op */
  },
};
