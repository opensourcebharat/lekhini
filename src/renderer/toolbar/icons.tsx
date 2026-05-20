import type { JSX } from 'solid-js';

const SVG = (children: JSX.Element): JSX.Element => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    {children}
  </svg>
);

export const Icons = {
  pencil: () =>
    SVG(
      <>
        {/* Pencil body with hex-style ferrule lines and a tip */}
        <path d="M3 21l3.5-1 11-11-2.5-2.5-11 11L3 21z" />
        <path d="M15 5l4 4" />
        <path d="M13 7l4 4" />
      </>,
    ),
  pen: () =>
    SVG(
      <>
        {/* Fountain pen: tapered body + visible nib slit */}
        <path d="M4 20l3.5-1L20 6.5 17.5 4 5 16.5z" />
        <path d="M5 16.5l3 3" />
        <path d="M6 18.5l1.5 1.5" />
        <path d="M15 5l4 4" />
      </>,
    ),
  highlighter: () =>
    SVG(
      <>
        <path d="M3 21l3-1 11-11-2-2L4 18l-1 3z" />
        <path d="M15 6l3 3" />
        <rect x="14" y="2.5" width="6" height="5" rx="1.2" transform="rotate(45 17 5)" />
      </>,
    ),
  eraser: () =>
    SVG(
      <>
        <path d="M3 17l8-8 7 7-4 4H7l-4-3z" />
        <path d="M9 21h12" />
      </>,
    ),
  hand: () =>
    SVG(
      <>
        <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
        <path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" />
        <path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V14" />
        <path d="M9 11V8.5a1.5 1.5 0 0 0-3 0V16c0 3 2 5 5 5h2c3 0 5-2 5-5v-2" />
      </>,
    ),
  line: () => SVG(<path d="M3 12h18" />),
  trendline: () =>
    SVG(
      <>
        <path d="M3 19L21 5" />
        <circle cx="4" cy="19" r="1.4" fill="currentColor" />
        <circle cx="20" cy="6" r="1.4" fill="currentColor" />
      </>,
    ),
  fib: () =>
    SVG(
      <>
        <path d="M3 6h18" />
        <path d="M3 10h18" opacity="0.7" />
        <path d="M3 14h18" opacity="0.5" />
        <path d="M3 18h18" opacity="0.35" />
      </>,
    ),
  region: () => SVG(<rect x="4" y="5" width="16" height="14" rx="1.5" stroke-dasharray="3 3" />),
  snip: () =>
    SVG(
      <>
        <rect x="5" y="5" width="14" height="14" rx="1" stroke-dasharray="3 2" />
        <path d="M3 7V4h3" />
        <path d="M21 7V4h-3" />
        <path d="M3 17v3h3" />
        <path d="M21 17v3h-3" />
      </>,
    ),
  ellipse: () => SVG(<ellipse cx="12" cy="12" rx="8.5" ry="6" />),
  whiteboard: () =>
    SVG(
      <>
        <rect x="3" y="4" width="18" height="13" rx="1.5" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
      </>,
    ),
  arrow: () =>
    SVG(
      <>
        <path d="M4 12h14" />
        <path d="M14 7l5 5-5 5" />
      </>,
    ),
  text: () =>
    SVG(
      <>
        <path d="M6 5h12" />
        <path d="M12 5v14" />
        <path d="M10 19h4" />
      </>,
    ),
  undo: () =>
    SVG(
      <>
        <path d="M9 14l-4-4 4-4" />
        <path d="M5 10h9a5 5 0 0 1 0 10h-3" />
      </>,
    ),
  redo: () =>
    SVG(
      <>
        <path d="M15 14l4-4-4-4" />
        <path d="M19 10h-9a5 5 0 0 0 0 10h3" />
      </>,
    ),
  clear: () =>
    SVG(
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M6 6l1 14h10l1-14" />
      </>,
    ),
  camera: () =>
    SVG(
      <>
        <path d="M3 8h4l2-3h6l2 3h4v11H3z" />
        <circle cx="12" cy="13" r="3.5" />
      </>,
    ),
  pause: () =>
    SVG(
      <>
        <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
        <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
      </>,
    ),
  play: () => SVG(<path d="M7 5l12 7-12 7V5z" fill="currentColor" />),
  orient: () =>
    SVG(
      <>
        <rect x="3" y="4" width="18" height="6" rx="1.2" />
        <rect x="3" y="14" width="10" height="6" rx="1.2" />
      </>,
    ),
  close: () =>
    SVG(
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6l-12 12" />
      </>,
    ),
  minus: () => SVG(<path d="M5 12h14" />),
  sun: () =>
    SVG(
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="M4.93 4.93l1.41 1.41" />
        <path d="M17.66 17.66l1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="M4.93 19.07l1.41-1.41" />
        <path d="M17.66 6.34l1.41-1.41" />
      </>,
    ),
  moon: () => SVG(<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />),
  gear: () =>
    SVG(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>,
    ),
  check: () =>
    SVG(<path d="M5 12l5 5L20 7" />),
  thickness: () =>
    SVG(
      <>
        {/* Three stacked lines of increasing weight — a universal */}
        {/* "thickness" / "stroke weight" icon. */}
        <path d="M4 7h16" stroke-width="1.2" />
        <path d="M4 12h16" stroke-width="2.4" />
        <path d="M4 17.5h16" stroke-width="4" />
      </>,
    ),
  collapse: () =>
    SVG(
      <>
        {/* Inward-pointing chevrons — "minimize / collapse". */}
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

