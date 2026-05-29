import type { TextShape } from '../../../shared/types';
import type { Tool, ToolContext } from './types';
import { nextId } from './types';

export const text: Tool = {
  id: 'text',
  onDown(sample, ctx) {
    void ctx.requestFocus().then(() => {
      ctx.promptText({ x: sample.x, y: sample.y }, (value: string) => {
        void ctx.releaseFocus();
        const raw = value.trim();
        if (!raw) return;
        const make = (content: string): TextShape => ({
          kind: 'text',
          id: nextId('text'),
          at: { x: sample.x, y: sample.y },
          text: content,
          color: ctx.settings.color,
          fontSize: Math.max(14, Math.round(ctx.settings.width * 4)),
          fontFamily: ctx.defaultFont(),
        });
        // Raw stays raw unless the user enabled typed autocorrect. When
        // on, run the text through the (local-first) corrector and
        // commit the result; on any failure fall back to the raw text.
        if (ctx.autocorrectTyped()) {
          void correctThenCommit(ctx, raw, make);
        } else {
          ctx.commit(make(raw));
        }
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

async function correctThenCommit(
  ctx: ToolContext,
  raw: string,
  make: (text: string) => TextShape,
): Promise<void> {
  try {
    const res = await window.pen.ai.autocorrect({ text: raw, profile: ctx.profile() });
    const fixed = res.text && res.text.trim().length > 0 ? res.text.trim() : raw;
    ctx.commit(make(fixed));
  } catch {
    ctx.commit(make(raw));
  }
}
