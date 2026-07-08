import type { JSX } from 'solid-js';

interface Props {
  active?: boolean;
  disabled?: boolean;
  // Native tooltip (platform-aware hint text, e.g. "Undo · ⌘Z").
  title: string;
  // Accessible name; falls back to title when omitted.
  label?: string;
  onClick: () => void;
  class?: string;
  children: JSX.Element;
}

// One large single-column toolbar button (Epic Pen style). Purely
// presentational — active/disabled state and handlers come from App.
export function ToolButton(props: Props) {
  return (
    <button
      class={`tool-btn ${props.active ? 'active' : ''} ${props.class ?? ''}`}
      onClick={() => props.onClick()}
      title={props.title}
      aria-label={props.label ?? props.title}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}
