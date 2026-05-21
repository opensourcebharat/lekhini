import type { ProviderId } from '../../shared/types';
import type { ModelOption, ProviderAdapter } from './types';
import { anthropic } from './anthropic';
import { openai } from './openai';
import { gemini } from './gemini';

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  anthropic,
  openai,
  gemini,
};

export function getAdapter(id: ProviderId): ProviderAdapter {
  const adapter = ADAPTERS[id];
  if (!adapter) throw new Error(`Unknown AI provider: ${id}`);
  return adapter;
}

// Vision-capable models exposed in the Settings dropdown. The first
// `recommended: true` entry is the default when the user picks a new
// provider. Keep this list small — every model adds a row to the
// dropdown and a maintenance line as providers rotate IDs.
export const MODELS_BY_PROVIDER: Record<ProviderId, ModelOption[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', recommended: true },
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast / cheap)' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o', recommended: true },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini (fast / cheap)' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', recommended: true },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ],
};

export function defaultModelFor(provider: ProviderId): string {
  const list = MODELS_BY_PROVIDER[provider];
  return (list.find((m) => m.recommended) ?? list[0]).id;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI ChatGPT',
  gemini: 'Google Gemini',
};

// The Settings UI uses this to render Set up → links to provider
// console pages for users to grab an API key.
export const PROVIDER_KEY_URLS: Record<ProviderId, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/app/apikey',
};
