import type { AskInput } from '../../shared/types';
import type { ProviderAdapter } from './types';
import { OLLAMA_HOST } from './ollamaService';
import { assembleTurns } from './messages';

// Ollama's /api/chat message shape. Vision models accept raw base64
// strings in `images` (NO `data:` prefix, unlike OpenAI's data URL).
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

function buildMessages(input: AskInput): OllamaMessage[] {
  const out: OllamaMessage[] = [{ role: 'system', content: input.systemPrompt }];
  // Image rides the FIRST user turn so follow-ups keep it in view.
  const { turns, firstUserIdx } = assembleTurns(input);
  turns.forEach((t, i) => {
    const msg: OllamaMessage = { role: t.role, content: t.content };
    if (input.image && i === firstUserIdx) msg.images = [input.image.base64];
    out.push(msg);
  });
  return out;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}

// Local provider. `apiKey` is ignored — models run on-device via the
// Ollama service. Streams NDJSON from /api/chat, yielding content
// deltas exactly like the cloud adapters so the IPC layer is unchanged.
export const ollama: ProviderAdapter = {
  id: 'ollama',
  async *ask(input, _apiKey, signal) {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        messages: buildMessages(input),
        stream: true,
      }),
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`Ollama ${res.status}: ${(await safeText(res)) || res.statusText}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let obj: { message?: { content?: unknown }; error?: unknown; done?: boolean };
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        if (obj.error) throw new Error(String(obj.error));
        const delta = obj.message?.content;
        if (typeof delta === 'string' && delta.length > 0) yield delta;
        if (obj.done) return;
      }
    }
  },
};
