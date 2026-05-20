import { getStroke } from 'perfect-freehand';
import { FIB_LEVELS } from '../../../shared/constants';
import type { Item } from '../../../shared/types';

// Two cached noise tiles for pencil rendering:
//
//   darkGrain  — sparse dark specks layered ATOP the stroke fill to
//                simulate graphite particles clumping on paper.
//   lightGrain — sparse holes punched OUT of the fill (destination-out)
//                so the paper / underlying canvas shows through, like
//                a pencil mark that didn't fully cover the tooth of
//                the page.
//
// Deterministic LCG seeds so the same rhythm repeats across strokes
// — gives the pencil a consistent identity instead of looking like
// random TV static.
const GRAIN_SIZE = 96;

function buildNoiseTile(seed: number, threshold: number, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = GRAIN_SIZE;
  c.height = GRAIN_SIZE;
  const cx = c.getContext('2d');
  if (!cx) return c;
  const img = cx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
  let state = seed | 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const r = rand();
    // Only the brightest values cross the threshold — keeps the noise
    // sparse rather than uniformly grey.
    const a = r > threshold ? Math.floor((r - threshold) * scale) : 0;
    img.data[i + 0] = 0;
    img.data[i + 1] = 0;
    img.data[i + 2] = 0;
    img.data[i + 3] = a;
  }
  cx.putImageData(img, 0, 0);
  return c;
}

let _darkGrain: HTMLCanvasElement | null = null;
let _lightGrain: HTMLCanvasElement | null = null;
function getDarkGrain(): HTMLCanvasElement {
  if (!_darkGrain) _darkGrain = buildNoiseTile(0x6d2b79f5, 0.68, 520);
  return _darkGrain;
}
function getLightGrain(): HTMLCanvasElement {
  if (!_lightGrain) _lightGrain = buildNoiseTile(0x1f83d9ab, 0.82, 380);
  return _lightGrain;
}

export function drawItem(ctx: CanvasRenderingContext2D, item: Item, live = false): void {
  switch (item.kind) {
    case 'stroke':
      drawStroke(ctx, item, live);
      break;
    case 'line':
    case 'trendline':
      drawLine(ctx, item);
      break;
    case 'fib':
      drawFib(ctx, item);
      break;
    case 'region':
      drawRegion(ctx, item);
      break;
    case 'ellipse':
      drawEllipse(ctx, item);
      break;
    case 'arrow':
      drawArrow(ctx, item);
      break;
    case 'text':
      drawText(ctx, item);
      break;
  }
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  item: Extract<Item, { kind: 'stroke' }>,
  _live: boolean,
): void {
  if (item.points.length === 0) return;
  const tool = item.tool;
  const isHi = tool === 'highlighter';
  const isPencil = tool === 'pencil';

  // Pencil renders at 0.85× the requested width — a hard pencil tip
  // lays down a finer line than an inked brush of the same nominal
  // size, and this scale is what makes the two tools read as
  // mechanically different at the same slider value.
  const widthScale = isPencil ? 0.85 : 1;
  const baseWidth = isHi ? Math.max(item.width, 14) : item.width * widthScale;
  const effectiveWidth = baseWidth;

  // Graphite isn't pure pigment — it reflects light, so it never lays
  // down at full opacity even on heavy pressure. The 0.88 factor keeps
  // pencil reading as graphite rather than ink. Pen and highlighter
  // use their settings directly.
  const baseAlpha = isHi ? Math.min(item.opacity, 0.35) : item.opacity;
  const effectiveAlpha = isPencil ? baseAlpha * 0.88 : baseAlpha;

  // Tool-specific stroke profiles. The key distinctions:
  //
  //   pencil  — no simulated pressure (uniform mark), low thinning,
  //             tight smoothing/streamline so the line tracks the
  //             hand instead of flowing. Abrupt ends (small taper).
  //             Combined with the grain pass below, it reads as
  //             graphite on paper.
  //   pen     — mild pressure-driven thinning, more smoothing so the
  //             ink flows. Generous tapers at start/end.
  //   highlight — flat width, no thinning, no taper. Marker behavior.
  let opts;
  if (isHi) {
    opts = {
      thinning: 0,
      smoothing: 0.5,
      streamline: 0.32,
      easing: (t: number) => t,
      simulatePressure: false,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    };
  } else if (isPencil) {
    opts = {
      thinning: 0.08,
      smoothing: 0.32,
      streamline: 0.26,
      easing: (t: number) => t,
      simulatePressure: false,
      start: { taper: Math.min(effectiveWidth * 0.6, 6), cap: true },
      end: { taper: Math.min(effectiveWidth * 0.9, 10), cap: true },
    };
  } else {
    // pen
    opts = {
      thinning: 0.45,
      smoothing: 0.55,
      streamline: 0.5,
      easing: (t: number) => t,
      simulatePressure: true,
      start: { taper: Math.min(effectiveWidth * 1, 12), cap: true },
      end: { taper: Math.min(effectiveWidth * 1.8, 28), cap: true },
    };
  }

  const strokePoints = getStroke(
    item.points.map((p) => [p.x, p.y, p.p]),
    {
      size: effectiveWidth,
      ...opts,
      last: !_live,
    },
  );
  if (strokePoints.length < 2) return;

  ctx.save();
  if (isHi) ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = effectiveAlpha;
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.moveTo(strokePoints[0][0], strokePoints[0][1]);
  for (let i = 1; i < strokePoints.length; i++) {
    const [x, y] = strokePoints[i];
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Pencil grain: two-pass texture so the stroke reads as graphite
  // pressed against paper rather than a uniform ink fill. The dark
  // pass deposits clusters of "graphite particles" on top, the light
  // pass punches out tiny pockets where the paper grain prevented the
  // graphite from sticking. Together they break up the perfect fill.
  if (isPencil && effectiveWidth <= 14) {
    ctx.clip();

    const dark = getDarkGrain();
    const darkPat = dark.width > 0 ? ctx.createPattern(dark, 'repeat') : null;
    if (darkPat) {
      ctx.globalAlpha = Math.min(effectiveAlpha, 1) * 0.55;
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = darkPat;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    const light = getLightGrain();
    const lightPat = light.width > 0 ? ctx.createPattern(light, 'repeat') : null;
    if (lightPat) {
      // destination-out subtracts alpha from the existing fill where
      // the noise tile is opaque — creating paper-tooth highlights.
      ctx.globalAlpha = 0.35;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = lightPat;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  }
  ctx.restore();
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  item: Extract<Item, { kind: 'line' | 'trendline' }>,
): void {
  ctx.save();
  ctx.globalAlpha = item.opacity;
  ctx.strokeStyle = item.color;
  ctx.lineWidth = item.width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(item.p1.x, item.p1.y);
  ctx.lineTo(item.p2.x, item.p2.y);
  ctx.stroke();
  ctx.restore();
}

function drawFib(ctx: CanvasRenderingContext2D, item: Extract<Item, { kind: 'fib' }>): void {
  ctx.save();
  ctx.globalAlpha = item.opacity;
  ctx.strokeStyle = item.color;
  ctx.fillStyle = item.color;
  ctx.lineWidth = 1;
  ctx.font = '11px -apple-system, system-ui, sans-serif';
  const dx = Math.abs(item.p2.x - item.p1.x);
  const xLeft = Math.min(item.p1.x, item.p2.x) - 4;
  const xRight = Math.max(item.p1.x, item.p2.x) + Math.max(dx, 120);
  const levels = item.levels.length ? item.levels : FIB_LEVELS;

  for (const L of levels) {
    const y = item.p1.y + (item.p2.y - item.p1.y) * L;
    ctx.beginPath();
    ctx.moveTo(xLeft, y);
    ctx.lineTo(xRight, y);
    ctx.stroke();
    if (item.showLabels) {
      ctx.fillText(`${L.toFixed(3)}`, xLeft - 32, y + 4);
    }
  }
  ctx.restore();
}

function drawRegion(
  ctx: CanvasRenderingContext2D,
  item: Extract<Item, { kind: 'region' }>,
): void {
  const x = Math.min(item.p1.x, item.p2.x);
  const y = Math.min(item.p1.y, item.p2.y);
  const w = Math.abs(item.p2.x - item.p1.x);
  const h = Math.abs(item.p2.y - item.p1.y);
  ctx.save();
  ctx.globalAlpha = item.opacity * 0.18;
  ctx.fillStyle = item.color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = item.opacity;
  ctx.strokeStyle = item.color;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  item: Extract<Item, { kind: 'ellipse' }>,
): void {
  const cx = (item.p1.x + item.p2.x) / 2;
  const cy = (item.p1.y + item.p2.y) / 2;
  const rx = Math.abs(item.p2.x - item.p1.x) / 2;
  const ry = Math.abs(item.p2.y - item.p1.y) / 2;
  ctx.save();
  ctx.globalAlpha = item.opacity;
  ctx.strokeStyle = item.color;
  ctx.lineWidth = item.width;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (item.fill) {
    ctx.fillStyle = item.color;
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, item: Extract<Item, { kind: 'arrow' }>): void {
  const dx = item.p2.x - item.p1.x;
  const dy = item.p2.y - item.p1.y;
  const angle = Math.atan2(dy, dx);
  const head = Math.max(8, item.width * 3);
  ctx.save();
  ctx.strokeStyle = item.color;
  ctx.fillStyle = item.color;
  ctx.lineWidth = item.width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(item.p1.x, item.p1.y);
  ctx.lineTo(item.p2.x, item.p2.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(item.p2.x, item.p2.y);
  ctx.lineTo(item.p2.x - head * Math.cos(angle - Math.PI / 7), item.p2.y - head * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(item.p2.x - head * Math.cos(angle + Math.PI / 7), item.p2.y - head * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, item: Extract<Item, { kind: 'text' }>): void {
  ctx.save();
  ctx.fillStyle = item.color;
  ctx.font = `${item.fontSize}px -apple-system, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  const lines = item.text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], item.at.x, item.at.y + i * item.fontSize * 1.2);
  }
  ctx.restore();
}
