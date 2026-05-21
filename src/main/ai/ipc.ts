import { BrowserWindow, ipcMain } from 'electron';
import type {
  AiStatus,
  AskInput,
  ChatSessionPayload,
  ConnectionTestResult,
  ProfileId,
  ProviderId,
  StreamChunk,
} from '../../shared/types';
import { deleteKey, getKey, hasKey, setKey } from './credentials';
import { getAdapter } from './registry';
import { patch as patchHub } from '../hub';

// Active in-flight requests, keyed by the requestId we hand back to
// the renderer. Lets the chat panel cancel a stream cleanly via
// ai:cancel. Removed on completion / error / cancellation.
const inFlight = new Map<string, AbortController>();

let requestSeq = 0;
function nextRequestId(): string {
  return `ai-${Date.now()}-${++requestSeq}`;
}

function broadcastChunk(chunk: StreamChunk): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('ai:chunk', chunk);
  }
}

function isProviderId(value: unknown): value is ProviderId {
  return value === 'anthropic' || value === 'openai' || value === 'gemini';
}

export function registerAiIpc(): void {
  ipcMain.handle('ai:set-key', (_evt, payload: { provider: ProviderId; key: string }) => {
    if (!isProviderId(payload.provider)) return;
    if (typeof payload.key !== 'string' || payload.key.trim().length === 0) {
      deleteKey(payload.provider);
      return;
    }
    setKey(payload.provider, payload.key);
  });

  ipcMain.handle('ai:delete-key', (_evt, payload: { provider: ProviderId }) => {
    if (!isProviderId(payload.provider)) return;
    deleteKey(payload.provider);
  });

  ipcMain.handle('ai:get-status', (): AiStatus[] => {
    return (['anthropic', 'openai', 'gemini'] as ProviderId[]).map((provider) => ({
      provider,
      configured: hasKey(provider),
    }));
  });

  // Tiny request that confirms the key reaches the provider and the
  // model exists. We use the default model for each provider and ask
  // it to reply with a single character — cheapest possible probe.
  ipcMain.handle(
    'ai:test-connection',
    async (_evt, payload: { provider: ProviderId; model: string }): Promise<ConnectionTestResult> => {
      const provider = payload.provider;
      const model = payload.model;
      if (!isProviderId(provider)) return { ok: false, message: 'Unknown provider' };
      const key = getKey(provider);
      if (!key) return { ok: false, message: 'No API key configured' };
      const adapter = getAdapter(provider);
      const ctrl = new AbortController();
      const started = Date.now();
      try {
        const stream = adapter.ask(
          {
            provider,
            model,
            systemPrompt: 'You are a connection test. Reply with a single dot.',
            history: [],
            userMessage: 'ping',
          },
          key,
          ctrl.signal,
        );
        let total = '';
        for await (const chunk of stream) {
          total += chunk;
          // First chunk is enough to confirm the round-trip.
          if (total.length > 0) {
            ctrl.abort();
            break;
          }
        }
        return { ok: true, latencyMs: Date.now() - started };
      } catch (err) {
        // AbortError on success-with-early-break is expected
        const msg = (err as Error)?.message ?? String(err);
        if (msg.toLowerCase().includes('abort')) {
          return { ok: true, latencyMs: Date.now() - started };
        }
        return { ok: false, message: msg };
      }
    },
  );

  ipcMain.handle(
    'ai:ask',
    async (_evt, input: AskInput): Promise<{ requestId: string }> => {
      const requestId = nextRequestId();
      if (!isProviderId(input.provider)) {
        broadcastChunk({ requestId, error: 'Unknown provider', done: true });
        return { requestId };
      }
      const key = getKey(input.provider);
      if (!key) {
        broadcastChunk({
          requestId,
          error: 'No API key configured for ' + input.provider,
          done: true,
        });
        return { requestId };
      }
      const adapter = getAdapter(input.provider);
      const ctrl = new AbortController();
      inFlight.set(requestId, ctrl);
      // Stream in the background so the IPC invoke can return the
      // requestId immediately. The renderer subscribes to 'ai:chunk'
      // events and matches by requestId.
      void (async () => {
        try {
          for await (const delta of adapter.ask(input, key, ctrl.signal)) {
            if (ctrl.signal.aborted) break;
            broadcastChunk({ requestId, delta });
          }
          broadcastChunk({ requestId, done: true });
        } catch (err) {
          const msg = (err as Error)?.message ?? String(err);
          // User-initiated abort isn't an error; just close cleanly.
          if (ctrl.signal.aborted || msg.toLowerCase().includes('abort')) {
            broadcastChunk({ requestId, done: true });
          } else {
            broadcastChunk({ requestId, error: msg, done: true });
          }
        } finally {
          inFlight.delete(requestId);
        }
      })();
      return { requestId };
    },
  );

  ipcMain.handle('ai:cancel', (_evt, payload: { requestId: string }) => {
    const ctrl = inFlight.get(payload.requestId);
    if (ctrl) ctrl.abort();
    inFlight.delete(payload.requestId);
  });

  // Renderer-facing chat:start handler. Calls startChatSession with
  // the bytes the renderer hands over. Equivalent to the in-process
  // startChatSession call that capture.ts makes for the snip-ask path.
  ipcMain.handle(
    'chat:start',
    (_evt, payload: { png: Uint8Array; mime: string; profile: ProfileId }) => {
      const sessionId = startChatSession(
        Buffer.from(payload.png),
        payload.mime,
        payload.profile,
      );
      return { sessionId };
    },
  );
}

// Shared helper: broadcast a new chat session to every renderer and
// open the dock-slot chat panel. Called by the chat:start IPC and
// also by capture.ts when Ask AI is triggered from the snip menu.
let chatSeq = 0;
export function startChatSession(
  png: Buffer,
  mime: string,
  profile: ProfileId,
): string {
  const sessionId = `chat-${Date.now()}-${++chatSeq}`;
  const session: ChatSessionPayload = { sessionId, png, mime, profile };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('chat:session', session);
  }
  patchHub({ chatOpen: true });
  return sessionId;
}
