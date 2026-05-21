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
      "You are looking at a screenshot the user has captured. Describe what's " +
      'shown concretely and concisely, then answer their question. If they ' +
      "don't ask a specific question, surface the most useful one or two " +
      'observations.',
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
      "You are explaining this captured image to a curious student. Identify " +
      'what is shown, why it matters in its subject area, and the single key ' +
      'idea the student should take away. Plain language; no jargon unless ' +
      'you define it. Keep it under 150 words unless the user asks for depth.',
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
      'You are an experienced market analyst looking at a price chart. ' +
      'In order: (1) name the instrument and timeframe if visible, (2) ' +
      'identify the prevailing trend, (3) call out key support / resistance ' +
      'levels and notable patterns, (4) offer one or two probabilistic ' +
      'scenarios with the invalidation level for each. Be concise; do not ' +
      'give financial advice — frame everything as observation.',
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
