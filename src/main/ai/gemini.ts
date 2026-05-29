import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AskInput } from '../../shared/types';
import type { ProviderAdapter } from './types';
import { assembleTurns } from './messages';

// Gemini's generateContentStream API takes content parts as either
// text or inlineData (base64 with mimeType). The streaming response
// gives chunks where each .text() returns the new delta. The system
// prompt is passed via `systemInstruction` on the model — separate
// from the messages.

type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };

type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

function roleFor(role: 'user' | 'assistant'): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

function buildContents(input: AskInput): GeminiContent[] {
  // Image attaches to the FIRST user turn so follow-ups keep it in view.
  const { turns, firstUserIdx } = assembleTurns(input);
  return turns.map((t, i): GeminiContent => {
    const parts: GeminiPart[] = [];
    if (input.image && i === firstUserIdx) {
      parts.push({ inlineData: { data: input.image.base64, mimeType: input.image.mime } });
    }
    parts.push({ text: t.content });
    return { role: roleFor(t.role), parts };
  });
}

export const gemini: ProviderAdapter = {
  id: 'gemini',
  async *ask(input, apiKey, signal) {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: input.model,
      systemInstruction: input.systemPrompt,
    });
    const result = await model.generateContentStream(
      { contents: buildContents(input) },
      { signal },
    );
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text.length > 0) yield text;
    }
  },
};
