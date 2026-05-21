import type { AskInput, ProviderId } from '../../shared/types';

export type { ProviderId, AskInput } from '../../shared/types';

// Each provider implements this interface in a separate file. The
// async iterable yields plain text deltas; the IPC layer pipes them
// to the renderer as 'ai:chunk' events. AbortSignal is honoured by
// all three SDKs (Anthropic / OpenAI / Gemini) and lets the renderer
// cancel an in-flight stream from the chat panel.
export interface ProviderAdapter {
  id: ProviderId;
  ask(
    input: AskInput,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncIterable<string>;
}

export interface ModelOption {
  id: string;
  label: string;
  recommended?: boolean;
}
