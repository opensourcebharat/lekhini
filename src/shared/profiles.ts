import type { ProfileId, ToolId } from './types';

export interface Profile {
  id: ProfileId;
  label: string;
  description: string;
  tools: ToolId[];
  // Default system prompt used when the user clicks "Ask AI" on a
  // snip while this profile is active. Overridable per profile in
  // Settings → AI. The user override lives in
  // PersistedState.aiProfilePrompts; this is the fallback.
  aiPrompt: string;
}

export const PROFILES: Record<ProfileId, Profile> = {
  general: {
    id: 'general',
    label: 'General',
    description: 'Everyday annotations — simple & common',
    tools: ['pencil', 'pen', 'eraser', 'hand', 'line', 'arrow', 'text', 'region', 'ellipse', 'snip'],
    aiPrompt:
      'You are a helpful assistant looking at a screenshot the user has ' +
      'captured. Your job is to SOLVE or answer what is in the image, not ' +
      'merely describe it. If it contains a problem, question, equation, ' +
      'code, a multiple-choice item, an error message, or any task — work it ' +
      'out and give the final answer, showing the key steps concisely. If the ' +
      'user asks a specific question, answer it directly. Only fall back to a ' +
      'short description when there is genuinely nothing to solve or answer.',
  },
  teacher: {
    id: 'teacher',
    label: 'Teacher',
    description: 'Online teaching & presentations',
    tools: [
      'pencil',
      'pen',
      'highlighter',
      'eraser',
      'hand',
      'line',
      'arrow',
      'text',
      'region',
      'ellipse',
      'snip',
    ],
    aiPrompt:
      'You are tutoring a student from this captured image. If it shows a ' +
      'problem or exercise (math, science, language, a question), SOLVE it ' +
      'step by step so the student can follow the reasoning, then state the ' +
      'final answer clearly. If it shows a concept or diagram instead, explain ' +
      'what it is, why it matters, and the single key idea to take away. Plain ' +
      'language; define any jargon. Be thorough on the solution, concise on ' +
      'commentary.',
  },
  trader: {
    id: 'trader',
    label: 'Trader',
    description: 'Chart analysis & journaling',
    tools: [
      'pen',
      'pencil',
      'eraser',
      'hand',
      'line',
      'trendline',
      'fib',
      'region',
      'arrow',
      'text',
      'snip',
    ],
    aiPrompt:
      'You are an experienced market analyst. Your input is either a price ' +
      'chart image or a set of technical levels the user has marked, given ' +
      'to you as computed numbers (treat any provided numbers as exact — do ' +
      'not re-estimate them). In order: (1) name the instrument and timeframe ' +
      'if known, (2) identify the prevailing trend, (3) call out the key ' +
      'support / resistance and Fibonacci levels and notable patterns, (4) ' +
      'offer one or two probabilistic scenarios with the invalidation level ' +
      'for each. Be concise; do not give financial advice — frame everything ' +
      'as observation.',
  },
};

export const DEFAULT_PROFILE: ProfileId = 'general';

export const PROFILE_ORDER: ProfileId[] = ['general', 'teacher', 'trader'];

// Returns the effective system prompt for a profile, preferring the
// user's override (when set) and falling back to the profile default.
export function resolveAiPrompt(
  profile: ProfileId,
  overrides: Partial<Record<ProfileId, string>>,
): string {
  const override = overrides[profile];
  if (override && override.trim().length > 0) return override;
  return PROFILES[profile].aiPrompt;
}
