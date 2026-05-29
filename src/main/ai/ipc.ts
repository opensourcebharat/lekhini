import { BrowserWindow, ipcMain, shell } from 'electron';
import type {
  AiStatus,
  AskInput,
  ChatSessionPayload,
  ConnectionTestResult,
  OllamaPullProgress,
  ProfileId,
  ProviderId,
  StreamChunk,
} from '../../shared/types';
import { deleteKey, getKey, hasKey, setKey } from './credentials';
import { defaultModelFor, getAdapter } from './registry';
import { patch as patchHub, getState as getHubState } from '../hub';
import {
  OLLAMA_INSTALL_URL,
  cancelPull,
  deleteModel,
  freeDiskBytes,
  getStatus as getOllamaStatus,
  listCatalog,
  listInstalled,
  pull as ollamaPull,
  start as startOllama,
} from './ollamaService';
import { MODEL_CATALOG, PROFILE_MODELS } from './ollamaModels';
import { capture as ragCapture, maybeSeed, retrieve as ragRetrieve } from './rag';

// System prompts for the one-shot correction calls.
const RECOGNIZE_PROMPT =
  'You are a strict OCR engine for handwriting. Output ONLY the exact words ' +
  'written in the image, transcribed verbatim and then lightly corrected for ' +
  'spelling and grammar. Hard rules: do NOT describe the image; never say it is ' +
  'a signature, handwriting, a drawing, or refer to "the image" or "the user"; ' +
  'no quotes, labels, commentary, apologies, or markdown — just the words. If ' +
  'you cannot read any actual words, output nothing at all (an empty response).';
const AUTOCORRECT_PROMPT =
  'You are an automated text-correction engine. Fix all grammar, spelling, ' +
  "typos, and awkward phrasing in the user's input. Return ONLY the corrected " +
  'text — no quotes, commentary, or explanation. Preserve the original meaning.';

const isCloudProvider = (v: unknown): v is ProviderId =>
  v === 'anthropic' ||
  v === 'openai' ||
  v === 'gemini' ||
  v === 'deepseek' ||
  v === 'sarvam';

const tagInstalled = (tag: string | null | undefined, installed: string[]): boolean =>
  !!tag &&
  (installed.includes(tag) || installed.includes(tag.includes(':') ? tag : `${tag}:latest`));

// Single chokepoint deciding which provider/model actually serves a
// request. Local-first: if Local AI is enabled, the service is up, and
// a suitable model is installed, route to Ollama; otherwise fall back
// to a configured cloud provider; otherwise return a friendly error.
type Resolved = { provider: ProviderId; model: string; key: string } | { error: string };

async function resolveProvider(input: AskInput): Promise<Resolved> {
  const hub = getHubState();
  const wantsVision = !!input.image;
  if (hub.aiLocalEnabled) {
    const svc = await getOllamaStatus();
    if (svc.running) {
      const installed = await listInstalled();
      const profile = input.profile ?? hub.profile;
      const kind: 'text' | 'vision' = wantsVision ? 'vision' : 'text';
      // Preference order: per-profile override → global default →
      // catalogue default for the profile → any installed model of the
      // right kind. First one that's actually installed wins.
      const candidates = [
        hub.aiProfileModels[profile]?.[kind],
        wantsVision ? hub.aiLocalVisionModel : hub.aiLocalModel,
        PROFILE_MODELS[profile]?.[kind],
      ];
      let model: string | null = candidates.find((c) => tagInstalled(c, installed)) ?? null;
      if (!model) {
        const cand = MODEL_CATALOG.find((m) => m.kind === kind && tagInstalled(m.tag, installed));
        model = cand?.tag ?? null;
      }
      if (model) return { provider: 'ollama', model, key: '' };
      // Local on but nothing usable → fall through to cloud.
    }
  }
  // Cloud fallback — prefer the configured active provider, else honour
  // an explicitly-requested cloud provider that happens to have a key.
  if (isCloudProvider(hub.aiActiveProvider) && hasKey(hub.aiActiveProvider)) {
    const p = hub.aiActiveProvider;
    return { provider: p, model: hub.aiActiveModel ?? defaultModelFor(p), key: getKey(p)! };
  }
  if (isCloudProvider(input.provider) && hasKey(input.provider)) {
    return {
      provider: input.provider,
      model: input.model || defaultModelFor(input.provider),
      key: getKey(input.provider)!,
    };
  }
  return {
    error: 'No AI available. Enable Local AI and install a model, or add a cloud provider key.',
  };
}

// Active in-flight requests, keyed by the requestId we hand back to
// the renderer. Lets the chat panel cancel a stream cleanly via
// ai:cancel. Removed on completion / error / cancellation.
const inFlight = new Map<string, AbortController>();

// Per-session snip cache. The renderer attaches the image only on the
// first turn; we stash it by sessionId and re-attach it on follow-up
// turns of the same conversation so context isn't lost. Bounded to the
// active conversation — a new session evicts the previous one.
const sessionImages = new Map<string, { mime: string; base64: string }>();

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
  return (
    value === 'anthropic' ||
    value === 'openai' ||
    value === 'gemini' ||
    value === 'deepseek' ||
    value === 'sarvam' ||
    value === 'ollama'
  );
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

  ipcMain.handle('ai:get-status', async (): Promise<AiStatus[]> => {
    const cloud = (
      ['anthropic', 'openai', 'gemini', 'deepseek', 'sarvam'] as ProviderId[]
    ).map((provider) => ({
      provider,
      configured: hasKey(provider),
    }));
    // Local is "configured" when the service is up AND ≥1 model is installed.
    const svc = await getOllamaStatus();
    const installed = svc.running ? await listInstalled() : [];
    cloud.push({ provider: 'ollama', configured: svc.running && installed.length > 0 });
    return cloud;
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
      // Local (ollama) needs no key; cloud providers do.
      const key = provider === 'ollama' ? '' : getKey(provider);
      if (provider !== 'ollama' && !key) return { ok: false, message: 'No API key configured' };
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
          key ?? '',
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
      // Carry the snip across follow-ups: cache it on first sight,
      // re-attach it on later turns of the same conversation. Done
      // BEFORE resolveProvider so wantsVision stays true and a vision
      // conversation keeps routing to its vision model.
      const sid = input.sessionId;
      if (sid) {
        if (input.image) {
          sessionImages.clear();
          sessionImages.set(sid, input.image);
        } else {
          const cached = sessionImages.get(sid);
          if (cached) input.image = cached;
        }
      }
      // The resolver decides local-vs-cloud and the concrete model,
      // so the renderer can stay provider-agnostic.
      const resolved = await resolveProvider(input);
      if ('error' in resolved) {
        broadcastChunk({ requestId, error: resolved.error, done: true });
        return { requestId };
      }
      const adapter = getAdapter(resolved.provider);
      const finalInput: AskInput = {
        ...input,
        provider: resolved.provider,
        model: resolved.model,
      };
      const ctrl = new AbortController();
      inFlight.set(requestId, ctrl);
      // Stream in the background so the IPC invoke can return the
      // requestId immediately. The renderer subscribes to 'ai:chunk'
      // events and matches by requestId.
      void (async () => {
        try {
          for await (const delta of adapter.ask(finalInput, resolved.key, ctrl.signal)) {
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

  // One-shot, non-streaming: drain the adapter into a single string.
  // Both go through the resolver, so local-first + cloud-fallback apply.
  async function runOneShot(input: AskInput): Promise<{ text: string; error?: string }> {
    const resolved = await resolveProvider(input);
    if ('error' in resolved) return { text: '', error: resolved.error };
    const adapter = getAdapter(resolved.provider);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      let out = '';
      for await (const delta of adapter.ask(
        { ...input, provider: resolved.provider, model: resolved.model },
        resolved.key,
        ctrl.signal,
      )) {
        out += delta;
      }
      return { text: out.trim() };
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      if (ctrl.signal.aborted || msg.toLowerCase().includes('abort')) {
        return { text: '', error: 'Timed out' };
      }
      return { text: '', error: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  // Handwriting recognition: image → corrected plain text (vision model).
  ipcMain.handle(
    'ai:recognize',
    (
      _evt,
      payload: { png: Uint8Array; mime?: string; profile?: ProfileId },
    ): Promise<{ text: string; error?: string }> =>
      runOneShot({
        provider: 'ollama',
        model: '',
        systemPrompt: RECOGNIZE_PROMPT,
        image: { mime: payload.mime ?? 'image/png', base64: Buffer.from(payload.png).toString('base64') },
        history: [],
        userMessage: 'Transcribe and correct the handwriting in this image.',
        profile: payload.profile,
      }),
  );

  // Typed-text autocorrect: text → corrected text (text model). Pulls
  // the user's most similar accepted corrections (RAG) into the prompt
  // as few-shot examples, and records the resulting pair to learn from.
  ipcMain.handle(
    'ai:autocorrect',
    async (
      _evt,
      payload: { text: string; profile?: ProfileId },
    ): Promise<{ text: string; error?: string }> => {
      const text = (payload.text ?? '').toString();
      if (text.trim().length === 0) return { text };
      const profile = payload.profile ?? getHubState().profile;

      const examples = await ragRetrieve(profile, text, 3);
      const systemPrompt =
        examples.length > 0
          ? AUTOCORRECT_PROMPT +
            '\n\nExamples of corrections this user prefers:\n' +
            examples.map((e) => `"${e.original}" → "${e.corrected}"`).join('\n')
          : AUTOCORRECT_PROMPT;

      const result = await runOneShot({
        provider: 'ollama',
        model: '',
        systemPrompt,
        history: [],
        userMessage: text,
        profile,
      });

      // Learn from the applied correction (best-effort, non-blocking).
      if (result.text && result.text.trim() !== text.trim()) {
        void ragCapture({ profile, kind: 'typed', original: text, corrected: result.text });
      }
      // Self-heal seeding once embeddings are reachable.
      void maybeSeed();
      return result;
    },
  );

  // ── Local Ollama service management ──
  const broadcastPull = (p: OllamaPullProgress): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('ollama:pull-progress', p);
    }
  };
  const refreshInstalled = async (): Promise<void> => {
    patchHub({ aiInstalledModels: await listInstalled() });
  };

  ipcMain.handle('ollama:status', () => getOllamaStatus());
  ipcMain.handle('ollama:start', () => startOllama());
  ipcMain.handle('ollama:list-models', () => listCatalog());
  ipcMain.handle('ollama:disk-space', () => freeDiskBytes());
  ipcMain.handle('ollama:pull', async (_evt, payload: { model: string }) => {
    await ollamaPull(payload.model, broadcastPull);
    await refreshInstalled();
    return { ok: true };
  });
  ipcMain.handle('ollama:cancel-pull', (_evt, payload: { model: string }) => {
    cancelPull(payload.model);
  });
  ipcMain.handle('ollama:delete-model', async (_evt, payload: { model: string }) => {
    await deleteModel(payload.model);
    await refreshInstalled();
  });
  ipcMain.handle('ollama:install-help', () => {
    void shell.openExternal(OLLAMA_INSTALL_URL);
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

  // Text-only chat session — no image. Used by the trader numeric
  // analysis flow: the overlay computes its levels and hands the text
  // here; the panel auto-fires it as the first user message.
  ipcMain.handle(
    'chat:start-text',
    (_evt, payload: { text: string; profile: ProfileId }) => {
      const sessionId = startTextChatSession(payload.text, payload.profile);
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

// Text-only counterpart of startChatSession — broadcasts a session with
// no image and an initial user message to auto-send.
export function startTextChatSession(initialText: string, profile: ProfileId): string {
  const sessionId = `chat-${Date.now()}-${++chatSeq}`;
  const session: ChatSessionPayload = { sessionId, initialText, profile };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('chat:session', session);
  }
  patchHub({ chatOpen: true });
  return sessionId;
}
