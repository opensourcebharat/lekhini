import { createSignal, onMount } from 'solid-js';
import type { JSX } from 'solid-js';

interface Props {
  // Anchor button's rect in window coordinates (getBoundingClientRect).
  anchor: DOMRect;
  orient: 'h' | 'v';
  // v-mode only: which side of the bar the card floats on. 'right'
  // means the bar hugs the window's left edge and the card floats to
  // its right; 'left' is the mirrored case (window grew leftward).
  side: 'left' | 'right';
  label: string;
  children: JSX.Element;
}

// Bar-main is 64px wide (v) / 64px tall (h); the card floats 8px away.
const BAR_CROSS = 64;
const GAP = 8;
const MARGIN = 8;

// Floating flyout card anchored to a toolbar button (Epic Pen style).
// v-mode: floats beside the anchor, vertically centered on it. h-mode:
// drops below the bar, horizontally centered on the anchor. Positions
// itself after first layout (its own size is needed for clamping), so
// it starts invisible for one frame.
export function FlyoutCard(props: Props) {
  const [style, setStyle] = createSignal<JSX.CSSProperties>({ visibility: 'hidden' });
  let el: HTMLDivElement | undefined;

  onMount(() => {
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (props.orient === 'v') {
      const top = clamp(
        props.anchor.top + props.anchor.height / 2 - h / 2,
        MARGIN,
        window.innerHeight - h - MARGIN,
      );
      const cross = `${BAR_CROSS + GAP}px`;
      setStyle(
        props.side === 'right'
          ? { top: `${top}px`, left: cross }
          : { top: `${top}px`, right: cross },
      );
    } else {
      const left = clamp(
        props.anchor.left + props.anchor.width / 2 - w / 2,
        MARGIN,
        window.innerWidth - w - MARGIN,
      );
      setStyle({ top: `${BAR_CROSS + GAP}px`, left: `${left}px` });
    }
  });

  return (
    <div ref={el} class="flyout-card" role="menu" aria-label={props.label} style={style()}>
      {props.children}
    </div>
  );
}
