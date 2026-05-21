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
  // Comes from hub.aiActiveProvider / aiActiveModel — null when the
  // user hasn't configured any provider. The panel shows a friendly
  // empty-state in that case rather than blowing up.
  provider: ProviderId | null;
  model: string | null;
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

  // Subscribe to chat:session broadcasts from main. Each new session
  // resets the panel — old conversation is dropped (we're ephemeral
  // by design in v1; persistence comes later).
  onMount(() => {
    const off = window.pen.chat.onSession((s) => {
      setSession(s);
      setTurns([]);
      setActiveRequest(null);
      // Kick off the first AI turn automatically: image + system prompt
      // do the work without the user typing anything.
      void runTurn('', s);
    });
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
    onCleanup(() => {
      off();
      offChunk();
    });
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
    if (!props.provider || !props.model) {
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          error: 'No AI provider configured. Open Settings → AI to set one up.',
        },
      ]);
      return;
    }
    // Push user turn (if non-empty — first auto-fired turn is "").
    setTurns((prev) =>
      userMessage.length > 0
        ? [...prev, { role: 'user', content: userMessage }]
        : prev,
    );
    // Push an open assistant turn that the streamed chunks will fill.
    setTurns((prev) => [...prev, { role: 'assistant', content: '', pending: true }]);

    const history: ChatTurn[] = turns()
      .filter((t) => !t.pending && !t.error)
      .map((t) => ({ role: t.role, content: t.content }));
    // First turn — image will be attached by main; remove the empty
    // user turn from history since the adapter wraps it itself.
    const isFirstTurn = !history.some((h) => h.role === 'user');

    const systemPrompt = resolveAiPrompt(s.profile, props.promptOverrides);
    const image = isFirstTurn
      ? { mime: s.mime, base64: uint8ToBase64(s.png) }
      : undefined;

    try {
      const { requestId } = await window.pen.ai.ask({
        provider: props.provider,
        model: props.model,
        systemPrompt,
        image,
        history: isFirstTurn ? [] : history,
        userMessage,
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
    if (!s) return null;
    const blob = new Blob([s.png as BlobPart], { type: s.mime });
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
          <Show when={props.provider && props.model}>
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

      <Show when={session()}>
        {(s) => (
          <div class="chat-thumb-wrap">
            <img class="chat-thumb" src={imageObjectUrl() ?? ''} alt="Snip" />
            <span class="chat-thumb-meta">{profileLabel()}</span>
            <span class="chat-thumb-sessionid" title={s().sessionId} />
          </div>
        )}
      </Show>

      <Show when={!session()}>
        <div class="chat-empty">
          Start a chat by taking a snip and clicking <strong>Ask AI</strong>.
        </div>
      </Show>

      <div class="chat-messages scroll-area" ref={scrollEl}>
        <For each={turns()}>
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
