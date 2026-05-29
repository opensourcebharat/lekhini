import OpenAI from 'openai';
import type { AskInput } from '../../shared/types';
import type { ProviderAdapter } from './types';
import { assembleTurns } from './messages';

// DeepSeek exposes an OpenAI-compatible API at api.deepseek.com, so we
// reuse the OpenAI SDK with a different baseURL. Its chat models
// (deepseek-chat = V3, deepseek-reasoner = R1) are TEXT-ONLY — they
// reject image inputs — so we never attach the snip here. An image
// session that resolves to DeepSeek is answered from the text alone;
// for image Q&A the resolver prefers a local vision model or a
// vision-capable cloud provider (Claude / GPT-4o / Gemini).

const MAX_TOKENS = 2048;
const BASE_URL = 'https://api.deepseek.com';

type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string };

function buildMessages(input: AskInput): Message[] {
  // No image part — DeepSeek can't see it — but we still replay the full
  // conversation so follow-ups keep their textual context. Empty opening
  // turns fall back to the solve-oriented default inside assembleTurns.
  const out: Message[] = [{ role: 'system', content: input.systemPrompt }];
  const { turns } = assembleTurns(input);
  for (const t of turns) out.push({ role: t.role, content: t.content });
  return out;
}

export const deepseek: ProviderAdapter = {
  id: 'deepseek',
  async *ask(input, apiKey, signal) {
    const client = new OpenAI({ apiKey, baseURL: BASE_URL });
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
