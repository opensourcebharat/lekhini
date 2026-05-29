import type { Item, StrokeItem } from '../../../shared/types';
import { drawItem } from './drawItem';

// A cross-platform handwriting/script font stack. Recognized ink is
// rendered in this so the converted text still reads as something the
// user "wrote" rather than a typeset paragraph — keeping the markup
// feeling realistic at the same place and size.
export const HANDWRITING_FONT =
  "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', 'Snell Roundhand', cursive";

// Heuristic: did the user hand-write a question / request (answer in
// chat) rather than a note to tidy up in place? Catches a trailing '?'
// and common interrogative / imperative openers used across profiles
// (e.g. "what…", "explain…", "analyze…", "solve…").
export function isLikelyQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  return /^(who|what|when|where|why|which|whom|whose|how|is|are|am|can|could|should|would|will|do|does|did|explain|define|describe|summarize|summarise|solve|calculate|analyse|analyze|compare|list|give|tell|find)\b/.test(
    t,
  );
}

// Detect when a vision model returned a DESCRIPTION of the image
// instead of a transcription (small models love to say "a signature",
// "the user wrote…", "this appears to be handwriting"). Such output
// must never replace the user's ink. Also rejects model refusals and
// absurdly long ramblings (a drawn word/phrase is short).
export function isDescriptiveJunk(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  if (t.length > 240) return true; // handwriting groups are short
  return /\b(signature|the image|this image|an image|the drawing|a drawing|appears? to|looks? like|seems? to|handwrit|the user (wrote|typed|drew)|i (can )?see|i'?m sorry|sorry,|cannot (read|make out|determine)|can'?t (read|tell)|unable to|no (legible|readable|visible|discernible)|illegible|it'?s (a|an)\b)/i.test(
    t,
  );
}

// Only freehand ink (pencil / pen) is recognized as handwriting.
// Highlighter is a marker, and every other Item is a shape — none of
// those are text, so they're excluded from recognition entirely.
export function isRecognizableStroke(item: Item): item is StrokeItem {
  return item.kind === 'stroke' && (item.tool === 'pencil' || item.tool === 'pen');
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

function strokeMinMax(s: StrokeItem): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of s.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  // Pad by half the stroke width so the rendered outline isn't clipped.
  const pad = s.width / 2 + 1;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

export function groupBounds(strokes: StrokeItem[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    const b = strokeMinMax(s);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// The color used by the most strokes in the group (tie-break by total
// point count) — used as the replacement text's color.
export function dominantColor(strokes: StrokeItem[]): string {
  const score = new Map<string, number>();
  for (const s of strokes) {
    score.set(s.color, (score.get(s.color) ?? 0) + s.points.length);
  }
  let best = strokes[0]?.color ?? '#3a3a3c';
  let bestScore = -1;
  for (const [color, n] of score) {
    if (n > bestScore) {
      bestScore = n;
      best = color;
    }
  }
  return best;
}

const RASTER_PAD = 12;

// Render the stroke group to an offscreen canvas on a WHITE background
// (vision models read dark-on-light far better than transparent ink).
// Sized in device pixels at the same DPR floor the live/committed
// layers use, then translated so the group's top-left maps to the pad
// origin.
export function rasterizeGroup(strokes: StrokeItem[], bounds: Bounds, dpr: number): HTMLCanvasElement {
  const cssW = bounds.w + RASTER_PAD * 2;
  const cssH = bounds.h + RASTER_PAD * 2;
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.ceil(cssW * dpr));
  off.height = Math.max(1, Math.ceil(cssH * dpr));
  const ctx = off.getContext('2d');
  if (!ctx) return off;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.translate(-bounds.x + RASTER_PAD, -bounds.y + RASTER_PAD);
  for (const s of strokes) drawItem(ctx, s);
  return off;
}
