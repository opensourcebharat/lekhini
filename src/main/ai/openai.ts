import OpenAI from 'openai';
import type { AskInput } from '../../shared/types';
import type { ProviderAdapter } from './types';
import { assembleTurns } from './messages';

// OpenAI's chat.completions API takes vision via `image_url` content
// parts on user messages. The URL can be a data: URL so we don't need
// to host the image anywhere. Stream chunks arrive with deltas under
// choices[0].delta.content as strings (null when the message starts).

const MAX_TOKENS = 2048;

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type OpenAIMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string };

function buildMessages(input: AskInput): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: 'system', content: input.systemPrompt }];
  // Image attaches to the FIRST user turn so follow-ups keep it in view.
  const { turns, firstUserIdx } = assembleTurns(input);
  turns.forEach((t, i) => {
    if (input.image && i === firstUserIdx) {
      out.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${input.image.mime};base64,${input.image.base64}` },
          },
          { type: 'text', text: t.content },
        ],
      });
    } else {
      out.push({ role: t.role, content: t.content });
    }
  });
  return out;
}

export const openai: ProviderAdapter = {
  id: 'openai',
  async *ask(input, apiKey, signal) {
    const client = new OpenAI({ apiKey });
    const stream = await client.chat.completions.create(
      {
        model: input.model,
        max_tokens: MAX_TOKENS,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: buildMessages(input) as any,
        stream: true,
      },
      { signal },
    );
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        yield delta;
      }
    }
  },
};
