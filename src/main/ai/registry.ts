import type { ProviderId } from '../../shared/types';
import type { ModelOption, ProviderAdapter } from './types';
import { anthropic } from './anthropic';
import { openai } from './openai';
import { gemini } from './gemini';
import { deepseek } from './deepseek';
import { sarvam } from './sarvam';
import { ollama } from './ollama';
import { MODEL_CATALOG } from './ollamaModels';
import { OLLAMA_INSTALL_URL } from './ollamaService';

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  anthropic,
  openai,
  gemini,
  deepseek,
  sarvam,
  ollama,
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
  // DeepSeek is text-only (no vision); great for reasoning / math on
  // typed questions and text follow-ups. deepseek-reasoner (R1) shows
  // its chain-of-thought; deepseek-chat (V3) is the faster general model.
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek V3 (chat)', recommended: true },
    { id: 'deepseek-reasoner', label: 'DeepSeek R1 (reasoner)' },
  ],
  // Sarvam solves from its own Vision OCR. sarvam-m is the confirmed
  // stable default; the larger models reason better on complex problems.
  sarvam: [
    { id: 'sarvam-m', label: 'Sarvam-M (24B)', recommended: true },
    { id: 'sarvam-30b', label: 'Sarvam-30B' },
    { id: 'sarvam-105b', label: 'Sarvam-105B (strongest)' },
  ],
  // For local, the real source of truth is which tags are installed
  // (the Local AI settings query Ollama directly). This static list
  // just gives defaultModelFor() a sane fallback.
  ollama: MODEL_CATALOG.filter((m) => m.kind !== 'embed').map((m) => ({
    id: m.tag,
    label: m.label,
    recommended: m.tag === 'llama3.2:1b',
  })),
};

export function defaultModelFor(provider: ProviderId): string {
  const list = MODELS_BY_PROVIDER[provider];
  return (list.find((m) => m.recommended) ?? list[0]).id;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI ChatGPT',
  gemini: 'Google Gemini',
  deepseek: 'DeepSeek',
  sarvam: 'Sarvam AI',
  ollama: 'Local (Ollama)',
};

// The Settings UI uses this to render Set up → links to provider
// console pages for users to grab an API key. Local has no key — its
// link points at the Ollama install/download page instead.
export const PROVIDER_KEY_URLS: Record<ProviderId, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/app/apikey',
  deepseek: 'https://platform.deepseek.com/api_keys',
  sarvam: 'https://dashboard.sarvam.ai',
  ollama: OLLAMA_INSTALL_URL,
};
