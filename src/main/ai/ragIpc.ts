import { ipcMain } from 'electron';
import type { ProfileId } from '../../shared/types';
import { capture, maybeSeed, resetProfile, stats, type RagKind } from './rag';

const isProfile = (v: unknown): v is ProfileId =>
  v === 'general' || v === 'teacher' || v === 'trader';

export function registerRagIpc(): void {
  // Examples-learned counts per profile (drives the Learning settings).
  ipcMain.handle('rag:stats', () => stats());

  // Forget everything learned for one profile (seed examples included).
  ipcMain.handle('rag:reset-profile', (_evt, payload: { profile: ProfileId }) => {
    if (!isProfile(payload?.profile)) return;
    return resetProfile(payload.profile);
  });

  // Record a correction the user accepted/edited, so it becomes
  // few-shot context for future corrections.
  ipcMain.handle(
    'rag:capture',
    (
      _evt,
      payload: { profile: ProfileId; kind: RagKind; original: string; corrected: string },
    ) => {
      if (!isProfile(payload?.profile)) return;
      return capture({
        profile: payload.profile,
        kind: payload.kind,
        original: payload.original,
        corrected: payload.corrected,
      });
    },
  );

  // Background-seed the bundled intent examples once embeddings are
  // available (self-heals on later launches if Ollama is down now).
  void maybeSeed();
}
