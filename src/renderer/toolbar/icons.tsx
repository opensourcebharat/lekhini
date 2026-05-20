import type { JSX } from 'solid-js';

// Toolbar icon set, redrawn in the Phosphor Icons visual language
// (https://phosphoricons.com — MIT). Each glyph is a fresh
// implementation tailored to Lekhini's 22×22 toolbar slot, not a
// verbatim copy of any Phosphor SVG. Stroke = 1.4 to match Phosphor's
// "regular" weight at 24px equivalent. Pure currentColor; the toolbar
// theme decides the actual hue via CSS.

const SVG = (children: JSX.Element): JSX.Element => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    {children}
  </svg>
);

export const Icons = {
  // PencilSimple — tilted shaft with a flat tip. No ferrule clutter.
  pencil: () =>
    SVG(
      <>
        <path d="M14.5 5.5l4 4L8 20H4v-4z" />
        <path d="M13 7l4 4" />
      </>,
    ),
  // Pen — angled barrel with a small nib square at the tip.
  pen: () =>
    SVG(
      <>
        <path d="M16 4l4 4L9 19l-5 1 1-5z" />
        <path d="M14 6l4 4" />
      </>,
    ),
  // Highlighter — square chisel head over a tapered shaft.
  highlighter: () =>
    SVG(
      <>
        <rect x="13" y="3" width="7" height="5" rx="1" transform="rotate(45 16.5 5.5)" />
        <path d="M10.5 8.5l5 5L7 22H3v-4z" />
        <path d="M9 16l-2 2" />
      </>,
    ),
  // Eraser — block-tip eraser with a base shadow line.
  eraser: () =>
    SVG(
      <>
        <path d="M15 4l5 5-9 9H6l-2-2 11-12z" />
        <path d="M9 12l5 5" />
        <path d="M4 21h16" />
      </>,
    ),
  // Hand — four-finger open palm.
  hand: () =>
    SVG(
      <>
        <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11" />
        <path d="M11 11V5a1.5 1.5 0 0 1 3 0v6" />
        <path d="M14 11V6a1.5 1.5 0 0 1 3 0v7" />
        <path d="M8 11V9a1.5 1.5 0 0 0-3 0v6.5c0 3 2.2 5.5 5.5 5.5h2c3 0 5.5-2.2 5.5-5.5V13" />
      </>,
    ),
  // Minus — single horizontal line.
  line: () => SVG(<path d="M4 12h16" />),
  // TrendUp — diagonal line with terminal dots.
  trendline: () =>
    SVG(
      <>
        <path d="M4 19L20 5" />
        <circle cx="4" cy="19" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="20" cy="5" r="1.3" fill="currentColor" stroke="none" />
      </>,
    ),
  // Stacked horizontal lines — Fibonacci/retracement.
  fib: () =>
    SVG(
      <>
        <path d="M4 5h16" />
        <path d="M4 10h16" opacity="0.7" />
        <path d="M4 14h16" opacity="0.5" />
        <path d="M4 19h16" opacity="0.35" />
      </>,
    ),
  // Selection — rounded dashed square.
  region: () => SVG(<rect x="4" y="5" width="16" height="14" rx="2" stroke-dasharray="3 3" />),
  // Crop — four L-corners with a dashed inner outline.
  snip: () =>
    SVG(
      <>
        <path d="M3 7V4h3" />
        <path d="M21 7V4h-3" />
        <path d="M3 17v3h3" />
        <path d="M21 17v3h-3" />
        <rect x="6" y="6" width="12" height="12" rx="1" stroke-dasharray="2 2" />
      </>,
    ),
  // Circle — clean ellipse.
  ellipse: () => SVG(<ellipse cx="12" cy="12" rx="8.5" ry="6" />),
  // Chalkboard — rounded frame with two stand legs.
  whiteboard: () =>
    SVG(
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M9 21l2-4" />
        <path d="M15 21l-2-4" />
      </>,
    ),
  // ArrowRight — single shaft with a clean chevron tip.
  arrow: () =>
    SVG(
      <>
        <path d="M4 12h15" />
        <path d="M14 7l5 5-5 5" />
      </>,
    ),
  // TextT — capital T with serifs at top and base.
  text: () =>
    SVG(
      <>
        <path d="M6 5h12" />
        <path d="M12 5v14" />
        <path d="M9.5 19h5" />
      </>,
    ),
  // ArrowUUpLeft — undo arrow.
  undo: () =>
    SVG(
      <>
        <path d="M9 14l-4-4 4-4" />
        <path d="M5 10h9a5 5 0 0 1 0 10h-3" />
      </>,
    ),
  // ArrowUUpRight — redo arrow.
  redo: () =>
    SVG(
      <>
        <path d="M15 14l4-4-4-4" />
        <path d="M19 10h-9a5 5 0 0 0 0 10h3" />
      </>,
    ),
  // Trash — clean lid + bin, no inner ribs.
  clear: () =>
    SVG(
      <>
        <path d="M4 7h16" />
        <path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
        <path d="M6 7l1.2 12.2a1.5 1.5 0 0 0 1.5 1.3h6.6a1.5 1.5 0 0 0 1.5-1.3L18 7" />
      </>,
    ),
  // Camera — body + shutter + grip notch.
  camera: () =>
    SVG(
      <>
        <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
        <circle cx="12" cy="13" r="3.5" />
      </>,
    ),
  pause: () =>
    SVG(
      <>
        <rect x="6" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
        <rect x="14.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
      </>,
    ),
  play: () =>
    SVG(<path d="M8 5l11 7-11 7z" fill="currentColor" />),
  // Rows / orientation — two stacked rounded bars.
  orient: () =>
    SVG(
      <>
        <rect x="3" y="4" width="18" height="6" rx="1.5" />
        <rect x="3" y="14" width="10" height="6" rx="1.5" />
      </>,
    ),
  // X — diagonals.
  close: () =>
    SVG(
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6l-12 12" />
      </>,
    ),
  minus: () => SVG(<path d="M5 12h14" />),
  // Sun — circle + 8 short cardinal/diagonal rays (Phosphor regular style).
  sun: () =>
    SVG(
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 3v2" />
        <path d="M12 19v2" />
        <path d="M3 12h2" />
        <path d="M19 12h2" />
        <path d="M5.6 5.6l1.4 1.4" />
        <path d="M17 17l1.4 1.4" />
        <path d="M5.6 18.4l1.4-1.4" />
        <path d="M17 7l1.4-1.4" />
      </>,
    ),
  moon: () => SVG(<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />),
  // Gear — simpler 6-tooth wheel + center hub. Phosphor's actual gear
  // has 8 teeth at this size; 6 reads cleaner in the 22px slot.
  gear: () =>
    SVG(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2.5" />
        <path d="M12 18.5V21" />
        <path d="M3 12h2.5" />
        <path d="M18.5 12H21" />
        <path d="M5.6 5.6l1.8 1.8" />
        <path d="M16.6 16.6l1.8 1.8" />
        <path d="M5.6 18.4l1.8-1.8" />
        <path d="M16.6 7.4l1.8-1.8" />
      </>,
    ),
  check: () => SVG(<path d="M5 12.5l4.5 4.5L20 6.5" />),
  // Lines — three stacked horizontal bars, varying weight.
  thickness: () =>
    SVG(
      <>
        <path d="M4 7h16" stroke-width="1" />
        <path d="M4 12h16" stroke-width="2.2" />
        <path d="M4 17.5h16" stroke-width="3.6" />
      </>,
    ),
  // ArrowsInSimple — two opposing chevrons.
  collapse: () =>
    SVG(
      <>
        <path d="M9 5l-4 4 4 4" />
        <path d="M15 11l4 4-4 4" />
      </>,
    ),
};

export const Logo = (): JSX.Element => (
  <svg width="22" height="22" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#e8c98a" />
        <stop offset="100%" stop-color="#a07835" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="28" height="28" rx="7" fill="#16161a" stroke="url(#lg)" stroke-width="1.4" />
    <path
      d="M9 23l2-1 11-11-2-2-11 11-1 2.6 .9.6z"
      fill="url(#lg)"
      stroke="#1c1c1e"
      stroke-width="0.6"
      stroke-linejoin="round"
    />
    <path d="M19 9l2 2" stroke="#1c1c1e" stroke-width="0.9" stroke-linecap="round" />
  </svg>
);
