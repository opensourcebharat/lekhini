import { onCleanup } from 'solid-js';
import type { JSX } from 'solid-js';

interface Props {
  // True when the group contains the active tool → accent fill.
  active: boolean;
  // True while this group's flyout card is open.
  open: boolean;
  title: string;
  label: string;
  // Select the shown (last-used) tool.
  onSelect: () => void;
  // Open this group's flyout.
  onOpenFlyout: () => void;
  // Registers the button element so App can anchor the flyout to it.
  ref?: (el: HTMLButtonElement) => void;
  children: JSX.Element;
}

const LONG_PRESS_MS = 350;

// A toolbar button standing in for a group of tools (Epic Pen style):
// shows the group's last-used tool plus a corner triangle. Click
// selects the shown tool; click-when-active or long-press opens the
// group flyout with the other members.
export function GroupButton(props: Props) {
  let pressTimer: number | null = null;
  let longPressed = false;

  const cancelPress = () => {
    if (pressTimer !== null) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
  };
  const onPointerDown = (e: PointerEvent) => {
    // Long-press only for the primary button / touch.
    if (e.button !== 0) return;
    longPressed = false;
    cancelPress();
    pressTimer = window.setTimeout(() => {
      pressTimer = null;
      longPressed = true;
      props.onOpenFlyout();
    }, LONG_PRESS_MS);
  };
  const onClick = () => {
    if (longPressed) {
      // The long-press already opened the flyout — swallow the click
      // that fires on release so it doesn't immediately re-toggle.
      longPressed = false;
      return;
    }
    if (props.active) props.onOpenFlyout();
    else props.onSelect();
  };
  onCleanup(cancelPress);

  return (
    <button
      ref={props.ref}
      class={`tool-btn group-btn ${props.active ? 'active' : ''} ${props.open ? 'open' : ''}`}
      onPointerDown={onPointerDown}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onClick={onClick}
      title={props.title}
      aria-label={props.label}
      aria-haspopup="menu"
      aria-expanded={props.open}
    >
      {props.children}
      <span class="group-corner" aria-hidden="true" />
    </button>
  );
}
