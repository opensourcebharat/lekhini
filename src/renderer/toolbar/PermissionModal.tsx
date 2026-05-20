import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Icons } from './icons';

interface Props {
  open: boolean;
  // Renderer informs the modal when the OS reports a fresh status —
  // used for the "still denied" hint after a manual Recheck.
  lastStatus: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown' | null;
  onClose: () => void;
}

// PermissionModal — surfaced when desktopCapturer can't proceed (macOS
// Screen Recording denied, or Linux Wayland user picked Deny in the
// portal). The macOS path is the one that needs hand-holding because
// the OS will not re-prompt programmatically; the user must toggle
// Lekhini on in System Settings and return focus, at which point we
// auto-recheck and the modal closes itself.
export function PermissionModal(props: Props) {
  const [busy, setBusy] = createSignal(false);
  const [stillDenied, setStillDenied] = createSignal(false);
  const isMac = (): boolean => navigator.userAgent.toLowerCase().includes('mac');

  const openSettings = (): void => {
    if (busy()) return;
    setBusy(true);
    void window.pen.permissions.open('screen');
    // Re-enable Recheck quickly so the user can confirm after granting.
    setTimeout(() => setBusy(false), 600);
  };

  const recheck = async (): Promise<void> => {
    setBusy(true);
    try {
      const status = (await window.pen.permissions.check()) as {
        screen: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
      };
      if (status.screen === 'granted') {
        props.onClose();
      } else {
        setStillDenied(true);
      }
    } finally {
      setBusy(false);
    }
  };

  // Auto-recheck whenever this window regains focus — the user almost
  // always reaches us via System Settings → toggle Lekhini → ⌘-tab
  // back. The focus event is the cheap, reliable trigger.
  let focusHandler: (() => void) | null = null;
  onMount(() => {
    focusHandler = () => {
      if (!props.open) return;
      void recheck();
    };
    window.addEventListener('focus', focusHandler);
  });
  onCleanup(() => {
    if (focusHandler) window.removeEventListener('focus', focusHandler);
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div class="perm-backdrop" role="presentation" />
        <div class="perm-modal" role="dialog" aria-modal="true" aria-labelledby="perm-title">
          <div class="perm-modal-icon">{Icons.camera()}</div>
          <div class="perm-modal-title" id="perm-title">
            Screen Recording is off
          </div>
          <div class="perm-modal-body">
            Lekhini captures the screen below the overlay so your annotations end
            up in the saved PNG.
            <Show when={isMac()}>
              {' '}macOS controls this permission — toggle Lekhini on under
              Privacy &amp; Security → Screen Recording, then return here.
            </Show>
            <Show when={!isMac()}>
              {' '}You denied the system prompt last time. Try the screenshot
              button again to be asked once more.
            </Show>
          </div>
          <Show when={stillDenied()}>
            <div class="perm-modal-hint">
              Still off. If you just toggled it on, give macOS a second and click
              Recheck again.
            </div>
          </Show>
          <div class="perm-modal-actions">
            <Show when={isMac()}>
              <button
                class="perm-btn perm-btn-primary"
                onClick={openSettings}
                disabled={busy()}
              >
                Open System Settings
              </button>
            </Show>
            <button class="perm-btn" onClick={() => void recheck()} disabled={busy()}>
              Recheck
            </button>
            <button class="perm-btn perm-btn-quiet" onClick={props.onClose}>
              Cancel
            </button>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
