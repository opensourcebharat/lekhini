import Anthropic from '@anthropic-ai/sdk';
import type { AskInput } from '../../shared/types';
import type { ProviderAdapter } from './types';

// The Anthropic SDK's MessageParam type is stricter than what's
// useful at our boundary (media_type is a literal union; content is
// a discriminated union per role). We build the array structurally
// and cast at the call site — the runtime shape matches the SDK
// expectations exactly. Stream shape documented at
// https://docs.anthropic.com/en/api/messages-streaming.

const MAX_TOKENS = 2048;

// Anthropic only accepts these image MIME types — coerce so the SDK
// doesn't reject. The user can only produce PNGs from snip today, so
// the runtime path is always 'image/png'.
function normaliseMime(mime: string): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' {
  if (mime === 'image/jpeg' || mime === 'image/gif' || mime === 'image/webp') return mime;
  return 'image/png';
}

function buildMessages(input: AskInput): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  // Prior turns go in verbatim. Prior user turns were text-only —
  // only the initial user turn carries the image.
  for (const turn of input.history) {
    out.push({ role: turn.role, content: turn.content });
  }
  const hasPriorUser = input.history.some((t) => t.role === 'user');
  if (input.image && !hasPriorUser) {
    out.push({
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: normaliseMime(input.image.mime),
            data: input.image.base64,
          },
        },
        {
          type: 'text',
          text:
            input.userMessage.length > 0
              ? input.userMessage
              : 'Please analyse the attached image as instructed.',
        },
      ],
    });
  } else {
    out.push({ role: 'user', content: input.userMessage });
  }
  return out;
}

export const anthropic: ProviderAdapter = {
  id: 'anthropic',
  async *ask(input, apiKey, signal) {
    const client = new Anthropic({ apiKey });
    const stream = client.messages.stream(
      {
        model: input.model,
        max_tokens: MAX_TOKENS,
        system: input.systemPrompt,
        messages: buildMessages(input),
      },
      { signal },
    );
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  },
};
