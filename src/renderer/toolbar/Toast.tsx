import { createSignal, For, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  // Optional action button (e.g. Reveal in Finder, Retry).
  action?: { label: string; run: () => void };
  // Defaults: success 4s, error 6s, info 5s.
  durationMs?: number;
}

interface Props {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}

// Toast — tiny non-modal banner that slides in from the bottom-right
// of the toolbar window. One stack, max 3 visible (older auto-evicted
// in the caller). Cheap success/error feedback for the screenshot
// path; reusable by anything else that needs ephemeral status.
export function Toast(props: Props) {
  return (
    <Portal>
      <div class="toast-stack" role="status" aria-live="polite">
        <For each={props.items}>
          {(t) => <ToastRow item={t} onDismiss={() => props.onDismiss(t.id)} />}
        </For>
      </div>
    </Portal>
  );
}

function ToastRow(rowProps: { item: ToastItem; onDismiss: () => void }) {
  const [exiting, setExiting] = createSignal(false);
  const duration = (): number =>
    rowProps.item.durationMs ?? (rowProps.item.kind === 'error' ? 6000 : 4500);

  const startExit = (): void => {
    if (exiting()) return;
    setExiting(true);
    // Let the slide-out animation finish before the parent removes us.
    setTimeout(() => rowProps.onDismiss(), 220);
  };

  const timer = setTimeout(startExit, duration());
  onCleanup(() => clearTimeout(timer));

  return (
    <div
      class={`toast toast-${rowProps.item.kind} ${exiting() ? 'is-exiting' : ''}`}
      onClick={(e) => {
        // Clicking the body dismisses; clicking the action button does
        // not (stopPropagation in the button below).
        if ((e.target as HTMLElement).closest('.toast-action, .toast-close')) return;
        startExit();
      }}
    >
      <span class="toast-msg">{rowProps.item.message}</span>
      <Show when={rowProps.item.action}>
        {(act) => (
          <button
            class="toast-action"
            onClick={(e) => {
              e.stopPropagation();
              act().run();
              startExit();
            }}
          >
            {act().label}
          </button>
        )}
      </Show>
      <button
        class="toast-close"
        onClick={(e) => {
          e.stopPropagation();
          startExit();
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
