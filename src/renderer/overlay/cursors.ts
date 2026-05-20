import type { ToolId } from '../../shared/types';

// Embed SVG markup as a CSS cursor URL. Encoding spaces / # is enough for
// data: URLs in Chrome; SVGs in cursor() require an explicit hotspot.
function asCursor(svg: string, hotspotX: number, hotspotY: number, fallback = 'crosshair'): string {
  const encoded = svg.replace(/\n/g, '').replace(/#/g, '%23').replace(/"/g, "'");
  return `url("data:image/svg+xml;utf8,${encoded}") ${hotspotX} ${hotspotY}, ${fallback}`;
}

// Pencil cursor: yellow wooden body, ferrule, sharpened tip in the user's
// (typically graphite) color. Tip sits at (3, 28).
function pencilCursor(color: string, dark: boolean): string {
  const body = dark ? '#f5d28a' : '#e0b870';
  const shaft = dark ? '#2c1f12' : '#3a2a18';
  const ferrule = dark ? '#a07835' : '#7c5a25';
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g stroke="${shaft}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    <path fill="${body}" d="M9 8l3-3 16 16-3 3z"/>
    <path fill="${ferrule}" d="M7 10l2-2 4 4-2 2z"/>
    <path fill="${color}" d="M3.5 28.5L4 25l3 3z"/>
    <path fill="${color}" d="M7 28L4 25l3-3 3 3z" opacity="0.9"/>
    <path fill="${shaft}" d="M5.5 27.5l-2.2 1.4 1.4-2.2z"/>
  </g>
</svg>`;
  return asCursor(svg, 3, 28);
}

// Pen cursor: slim cylindrical barrel with a chrome ring and a nib in
// the active color. Distinct silhouette from the pencil so the user can
// tell at a glance which tool is live. Tip at (3, 28).
function penCursor(color: string, dark: boolean): string {
  const barrel = dark ? '#1f1f23' : '#2a2a2e';
  const chrome = dark ? '#cfcfd4' : '#a0a0a6';
  const outline = '#0e0e10';
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g stroke="${outline}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
    <path fill="${barrel}" d="M11 6l3-3 15 15-3 3z"/>
    <path fill="${chrome}" d="M9 8l2-2 4 4-2 2z"/>
    <path fill="${color}" d="M5.2 26L9 22.2l3 3L8.2 29z"/>
    <path fill="${color}" d="M3 28.7L5 25l3 3-3.4 2-1.6-1.3z" opacity="0.92"/>
    <path fill="${outline}" d="M3.5 28.5l1.5-1.2 1 1.4z"/>
  </g>
</svg>`;
  return asCursor(svg, 3, 28);
}

// Highlighter shaped cursor with chisel tip in selected color.
function highlighterCursor(color: string): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g stroke="#1c1c1e" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    <rect x="14" y="3" width="10" height="6" rx="1.4" transform="rotate(45 19 6)" fill="#dddde0"/>
    <path fill="${color}" d="M5 27l2-2 4 4-2 2z" opacity="0.95"/>
    <path fill="${color}" d="M7 25L19 13l4 4L11 29z" opacity="0.45"/>
    <path fill="${color}" d="M5 27l2-2 4 4-2 2z"/>
  </g>
</svg>`;
  return asCursor(svg, 4, 28);
}

// Eraser cursor: nub icon plus a circle sized to current width.
function eraserCursor(width: number): string {
  const size = Math.max(16, Math.min(width + 6, 96));
  const r = Math.max(6, Math.min(width / 2, 44));
  const c = size / 2;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${c}" cy="${c}" r="${r}" fill="rgba(255,255,255,0.18)" stroke="#1c1c1e" stroke-width="1.2"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#ffffff" stroke-width="0.6" stroke-dasharray="2 3"/>
  <circle cx="${c}" cy="${c}" r="1.4" fill="#1c1c1e"/>
</svg>`;
  return asCursor(svg, c, c);
}

export function cursorFor(
  tool: ToolId,
  color: string,
  width: number,
  theme: 'dark' | 'light' = 'dark',
): string {
  switch (tool) {
    case 'pencil':
      return pencilCursor(color, theme === 'dark');
    case 'pen':
      return penCursor(color, theme === 'dark');
    case 'highlighter':
      return highlighterCursor(color);
    case 'eraser':
      return eraserCursor(width);
    case 'hand':
      return 'grab';
    case 'text':
      return 'text';
    default:
      return 'crosshair';
  }
}
