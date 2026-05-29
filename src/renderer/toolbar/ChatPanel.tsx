import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { marked } from 'marked';
import { PROFILES, resolveAiPrompt } from '../../shared/profiles';
import type {
  ChatSessionPayload,
  ChatTurn,
  ProfileId,
  ProviderId,
} from '../../shared/types';
import { Icons } from './icons';

interface Props {
  // Comes from hub.aiActiveProvider / aiActiveModel — the cloud
  // fallback pair, null when no cloud provider is configured. Main's
  // resolver may override this with a local model, so these are just a
  // hint; routing is authoritative server-side.
  provider: ProviderId | null;
  model: string | null;
  // True when ANY AI path is usable (local model installed OR a cloud
  // provider configured). Drives the empty-state instead of provider.
  aiReady: boolean;
  // The active chat session, lifted to ToolbarApp (which is always
  // mounted) so the very first snip isn't dropped. See the createEffect
  // below for why this can't live as a subscription inside this panel.
  session: ChatSessionPayload | null;
  promptOverrides: Partial<Record<ProfileId, string>>;
  onClose: () => void;
}

interface DisplayTurn extends ChatTurn {
  // Streaming responses arrive in chunks; we mark the open assistant
  // turn so we know which one to append to. Cleared when 'done'
  // fires for the matching requestId.
  pending?: boolean;
  // Error string when the request failed mid-stream.
  error?: string;
}

// Configure marked once. We don't enable HTML parsing (security: the
// model could output <script>) — marked escapes by default.
marked.setOptions({ breaks: true, gfm: true });

export function ChatPanel(props: Props) {
  const [session, setSession] = createSignal<ChatSessionPayload | null>(null);
  const [turns, setTurns] = createSignal<DisplayTurn[]>([]);
  const [composer, setComposer] = createSignal('');
  const [activeRequest, setActiveRequest] = createSignal<string | null>(null);
  let scrollEl: HTMLDivElement | undefined;
  let composerEl: HTMLTextAreaElement | undefined;

  // React to the session prop. The subscription that produces it lives
  // in ToolbarApp (always mounted) rather than here, because this panel
  // only mounts once hub.chatOpen flips true — and main broadcasts
  // chat:session at the same moment it sets chatOpen. A listener inside
  // this panel's onMount would miss the FIRST session every time (the
  // event fired before the panel existed), which is exactly the "first
  // Ask AI opens an empty chat, second one works" bug. Reacting to the
  // prop runs the opening turn whether the session lands before or after
  // mount. Each new sessionId resets the panel — old conversation is
  // dropped (ephemeral by design in v1; persistence comes later).
  let lastSessionId: string | null = null;
  createEffect(() => {
    const s = props.session;
    if (!s || s.sessionId === lastSessionId) return;
    lastSessionId = s.sessionId;
    setSession(s);
    setTurns([]);
    setActiveRequest(null);
    // Kick off the first AI turn automatically. Image sessions fire
    // with "" (the image + system prompt carry the request); text
    // sessions fire with their precomputed initialText.
    void runTurn(s.initialText ?? '', s);
  });

  onMount(() => {
    const offChunk = window.pen.ai.onChunk((c) => {
      if (c.requestId !== activeRequest()) return;
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        if (c.error) {
          next[next.length - 1] = { ...last, error: c.error, pending: false };
        } else if (c.delta) {
          next[next.length - 1] = { ...last, content: last.content + c.delta };
        }
        if (c.done) {
          next[next.length - 1] = { ...next[next.length - 1], pending: false };
        }
        return next;
      });
      if (c.done) {
        setActiveRequest(null);
        queueMicrotask(focusComposer);
      }
    });
    onCleanup(offChunk);
  });

  // Auto-scroll to the bottom as the assistant streams.
  createEffect(() => {
    void turns();
    if (!scrollEl) return;
    queueMicrotask(() => {
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    });
  });

  const focusComposer = (): void => composerEl?.focus();

  // Build an asynchronous turn. On the FIRST user turn (no prior user
  // history) we attach the image. Subsequent turns are text-only —
  // each provider adapter follows the same convention.
  const runTurn = async (
    userMessage: string,
    forSession?: ChatSessionPayload,
  ): Promise<void> => {
    const s = forSession ?? session();
    if (!s) return;
    if (!props.aiReady) {
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          error:
            'No AI available. Enable Local AI and install a model, or add a cloud provider key in Settings → AI.',
        },
      ]);
      return;
    }
    // Snapshot the conversation BEFORE adding this turn — that's the
    // history we replay. Building it after the pushes would duplicate
    // the current message (also sent separately as userMessage).
    const history: ChatTurn[] = turns()
      .filter((t) => !t.pending && !t.error)
      .map((t) => ({ role: t.role, content: t.content }));
    // First turn = no prior user turn. The image attaches here; main
    // caches it and re-injects it on follow-ups so context is retained.
    const isFirstTurn = !history.some((h) => h.role === 'user');

    // Record the user turn — INCLUDING the auto-fired opening turn whose
    // text is empty (the image carries the request). Storing it keeps the
    // original ask in the replayed history so follow-ups don't go amnesiac.
    setTurns((prev) => [...prev, { role: 'user', content: userMessage }]);
    // Push an open assistant turn that the streamed chunks will fill.
    setTurns((prev) => [...prev, { role: 'assistant', content: '', pending: true }]);

    const systemPrompt = resolveAiPrompt(s.profile, props.promptOverrides);
    const image =
      isFirstTurn && s.png
        ? { mime: s.mime ?? 'image/png', base64: uint8ToBase64(s.png) }
        : undefined;

    try {
      const { requestId } = await window.pen.ai.ask({
        // Hints only — main's resolver picks local-vs-cloud and the
        // concrete model. Default to local when no cloud pair is set.
        provider: props.provider ?? 'ollama',
        model: props.model ?? '',
        systemPrompt,
        image,
        history,
        userMessage,
        profile: s.profile,
        // Scopes the conversation so main caches the snip (and Sarvam its
        // OCR) per chat, until a new snip starts a fresh session.
        sessionId: s.sessionId,
      });
      setActiveRequest(requestId);
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = { ...last, error: msg, pending: false };
        }
        return next;
      });
    }
  };

  const onSend = (): void => {
    const text = composer().trim();
    if (text.length === 0 || activeRequest() !== null) return;
    setComposer('');
    void runTurn(text);
  };

  const onCancel = (): void => {
    const id = activeRequest();
    if (id) void window.pen.ai.cancel(id);
    setActiveRequest(null);
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === 'assistant' && last.pending) {
        next[next.length - 1] = { ...last, pending: false };
      }
      return next;
    });
  };

  const onComposerKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSend();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      props.onClose();
    }
  };

  // The snip image is large (200KB-2MB Uint8Array); render it via
  // an object URL so we don't have to base64-encode for an <img>.
  const imageObjectUrl = (): string | null => {
    const s = session();
    if (!s || !s.png) return null;
    const blob = new Blob([s.png as BlobPart], { type: s.mime ?? 'image/png' });
    return URL.createObjectURL(blob);
  };

  const profileLabel = (): string => {
    const s = session();
    return s ? PROFILES[s.profile].label : '';
  };

  return (
    <div class="settings-panel chat-panel">
      <div class="settings-header">
        <div class="chat-header-meta">
          <span class="settings-title">Ask AI</span>
          <Show when={props.provider && props.model} fallback={
            <Show when={props.aiReady}>
              <span class="chat-provider-badge">Local</span>
            </Show>
          }>
            <span class="chat-provider-badge">
              {props.provider} · {props.model}
            </span>
          </Show>
        </div>
        <button
          class="winctl"
          onClick={props.onClose}
          title="Close chat"
        >{Icons.close()}</button>
      </div>

      <Show when={session() && session()!.png}>
        {(_present) => (
          <div class="chat-thumb-wrap">
            <img class="chat-thumb" src={imageObjectUrl() ?? ''} alt="Snip" />
            <span class="chat-thumb-meta">{profileLabel()}</span>
            <span class="chat-thumb-sessionid" title={session()!.sessionId} />
          </div>
        )}
      </Show>

      <Show when={!session()}>
        <div class="chat-empty">
          Start a chat by taking a snip and clicking <strong>Ask AI</strong>.
        </div>
      </Show>

      <div class="chat-messages scroll-area" ref={scrollEl}>
        {/* Hide the auto-fired opening user turn (empty text — the snip
            thumbnail above already represents it); it exists only to
            anchor the replayed history. */}
        <For each={turns().filter((t) => t.role !== 'user' || t.content.length > 0)}>
          {(turn) => (
            <div class={`chat-bubble chat-bubble-${turn.role}`}>
              <Show when={turn.role === 'assistant' && turn.pending && turn.content.length === 0}>
                <span class="chat-typing">Thinking…</span>
              </Show>
              <Show when={turn.error}>
                <span class="chat-error">⚠ {turn.error}</span>
              </Show>
              <Show when={turn.content.length > 0}>
                <div
                  class="chat-markdown"
                  innerHTML={renderMarkdown(turn.content)}
                />
              </Show>
            </div>
          )}
        </For>
      </div>

      <div class="chat-composer">
        <textarea
          ref={composerEl}
          class="chat-input"
          placeholder={
            session() ? 'Ask a follow-up… (⌘↩ to send, Esc to close)' : 'Take a snip first'
          }
          value={composer()}
          onInput={(e) => setComposer((e.currentTarget as HTMLTextAreaElement).value)}
          onKeyDown={onComposerKey}
          disabled={!session()}
          rows={2}
        />
        <Show
          when={activeRequest() === null}
          fallback={
            <button class="chat-send chat-cancel" onClick={onCancel}>
              Cancel
            </button>
          }
        >
          <button
            class="chat-send"
            onClick={onSend}
            disabled={!session() || composer().trim().length === 0}
            title="Send (⌘↩)"
          >
            Send
          </button>
        </Show>
      </div>
    </div>
  );
}

// Uint8Array → base64. atob/btoa don't accept binary directly, so we
// build the string in chunks to avoid the call-stack limit on large
// images.
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  return btoa(s);
}

function renderMarkdown(src: string): string {
  // marked.parse returns string | Promise<string>; we use the sync
  // path by passing no async options. Cast is safe.
  return marked.parse(src) as string;
}
