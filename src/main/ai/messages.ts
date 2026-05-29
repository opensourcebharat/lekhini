import type { AskInput } from '../../shared/types';
import { SOLVE_FIRST_TURN } from '../../shared/constants';

export interface AssembledTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Assemble the full ordered turn list for one request — prior history
// plus the current user message — and report the index of the FIRST
// user turn. That index is where every adapter attaches the image, so
// follow-up turns keep the original visual/OCR context instead of only
// replaying the assistant's earlier answer.
//
// An empty user turn (the auto-fired opening turn carries no text — the
// image + system prompt are the request) falls back to SOLVE_FIRST_TURN
// so the model gets a clear instruction and the conversation always
// starts with a non-empty user message (Anthropic requires the first
// message to be a user turn).
export function assembleTurns(input: AskInput): {
  turns: AssembledTurn[];
  firstUserIdx: number;
} {
  const turns: AssembledTurn[] = input.history.map((t) => ({
    role: t.role,
    content: t.role === 'user' && t.content.length === 0 ? SOLVE_FIRST_TURN : t.content,
  }));
  turns.push({
    role: 'user',
    content: input.userMessage.length > 0 ? input.userMessage : SOLVE_FIRST_TURN,
  });
  const firstUserIdx = turns.findIndex((t) => t.role === 'user');
  return { turns, firstUserIdx };
}
