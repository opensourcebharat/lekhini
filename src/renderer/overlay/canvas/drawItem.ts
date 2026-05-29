import { getStroke } from 'perfect-freehand';
import { FIB_LEVELS, fibColor } from '../../../shared/constants';
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
  live: boolean,
): void {
  if (item.points.length === 0) return;
  const tool = item.tool;
  const isHi = tool === 'highlighter';
  const isPencil = tool === 'pencil';

  // Pencil renders at 0.75× the requested width — a hard pencil tip
  // lays down a finer line than an inked brush of the same nominal
  // size. This scale both makes the two tools read as mechanically
  // different at the same slider value and keeps pencil handwriting
  // compact, so small letters don't eat horizontal space.
  const widthScale = isPencil ? 0.75 : 1;
  const baseWidth = isHi ? Math.max(item.width, 14) : item.width * widthScale;
  const effectiveWidth = baseWidth;

  // Graphite isn't pure pigment — it reflects light, so it never lays
  // down at full opacity even on heavy pressure. The 0.88 factor keeps
  // pencil reading as graphite rather than ink. Pen and highlighter
  // use their settings directly.
  const baseAlpha = isHi ? Math.min(item.opacity, 0.35) : item.opacity;
  const effectiveAlpha = isPencil ? baseAlpha * 0.88 : baseAlpha;

  // Fast path for the in-progress (live) stroke: draw the points as a
  // round-capped, round-joined polyline instead of running getStroke
  // over the whole array every frame. getStroke is O(n) per call, and
  // calling it each frame on a growing stroke is O(n²) — the dominant
  // source of latency on long handwriting strokes. A polyline at the
  // effective width is visually near-identical to the committed pen
  // outline (which is now uniform / untapered) and to a pencil/marker
  // core; the full getStroke render — plus pencil grain — runs once on
  // commit. This keeps the live cursor glued to the hand regardless of
  // stroke length.
  if (live) {
    ctx.save();
    if (isHi) ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = effectiveAlpha;
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineWidth = effectiveWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pts = item.points;
    if (pts.length === 1) {
      // A single down-sample has no segment to stroke — lay a dot so
      // the very first contact is visible immediately.
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, effectiveWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

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
    // Precise thin handwriting, same principle as the pen: a fully
    // UNIFORM mark. thinning is now 0 (was 0.04) and the start/end
    // tapers are dropped (were up to 4px / 7px) — together those were
    // still widening mid-stroke and pinching the ends, the milder
    // version of the pen's old ballooning. A hard graphite tip lays a
    // constant-width line anyway; its "pencil" identity comes from the
    // grain pass below, not from width variation. Low streamline keeps
    // the line tracking the wrist for small letters.
    opts = {
      thinning: 0,
      smoothing: 0.28,
      streamline: 0.18,
      easing: (t: number) => t,
      simulatePressure: false,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    };
  } else {
    // pen — tuned for precise thin handwriting on a mouse/trackpad.
    // simulatePressure is OFF: a mouse reports no real pressure, so
    // perfect-freehand's velocity-derived fake pressure inflated slow
    // strokes — and handwriting IS slow, so letters ballooned and
    // smeared together ("large space with minimum movement"). With
    // thinning 0 the pen lays a uniform-width line that tracks the hand
    // 1:1, and the tapers are dropped so short strokes don't get pinched
    // or stretched. Light streamline keeps curves smooth without lag.
    opts = {
      thinning: 0,
      smoothing: 0.4,
      streamline: 0.34,
      easing: (t: number) => t,
      simulatePressure: false,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    };
  }

  const strokePoints = getStroke(
    item.points.map((p) => [p.x, p.y, p.p]),
    {
      size: effectiveWidth,
      ...opts,
      last: !live,
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

// Trailing-zero-free ratio label: 0, 0.236, 0.5, 1 …
function formatFibLevel(L: number): string {
  return String(L);
}

// Percentage readout for a level: 0%, 23.6%, 50%, 61.8%, 100% …
function formatFibPct(L: number): string {
  const p = L * 100;
  return `${Number.isInteger(p) ? p : Number(p.toFixed(1))}%`;
}

function drawFib(ctx: CanvasRenderingContext2D, item: Extract<Item, { kind: 'fib' }>): void {
  const levels = (item.levels.length ? item.levels : FIB_LEVELS).slice().sort((a, b) => a - b);
  if (levels.length === 0) return;

  // Horizontal span IS the box width the user dragged out — the hand
  // tool's corner handles edit p1.x / p2.x to widen or narrow it, so we
  // no longer force a fixed rightward extension. Only when the box is
  // essentially zero-width (the fib was dragged straight down) do we
  // fall back to a default projection so the levels stay visible.
  const left = Math.min(item.p1.x, item.p2.x);
  const right = Math.max(item.p1.x, item.p2.x);
  const MIN_FIB_W = 16;
  const DEFAULT_FIB_W = 220;
  const xLeft = left;
  const xRight = right - left >= MIN_FIB_W ? right : left + DEFAULT_FIB_W;
  // A retracement is measured back from the END of the move toward its
  // START, the same as TradingView / MT: 0% sits at the second point
  // (p2, where the drag ended — the impulse's extreme) and 100% at the
  // first point (p1, the move's origin). Level L is the fraction of the
  // move retraced, so it interpolates from p2 (L=0) to p1 (L=1).
  // Anchoring at p1 for L=0 — as the old code did — mirrored every
  // level (e.g. the 0.618 line landed at the 0.382 position).
  const yAt = (L: number): number => item.p2.y + (item.p1.y - item.p2.y) * L;

  ctx.save();

  // Translucent colored zones between consecutive levels — the banded
  // look of a trading-chart fib. Each band is tinted with the color of
  // the level it retraces INTO (its upper boundary), kept faint so the
  // underlying chart stays readable through it.
  for (let i = 0; i < levels.length - 1; i++) {
    const yA = yAt(levels[i]);
    const yB = yAt(levels[i + 1]);
    ctx.globalAlpha = item.opacity * 0.1;
    ctx.fillStyle = fibColor(levels[i + 1]);
    ctx.fillRect(xLeft, Math.min(yA, yB), xRight - xLeft, Math.abs(yB - yA));
  }

  ctx.font = '11px -apple-system, system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  for (const L of levels) {
    const y = yAt(L);
    const col = fibColor(L);
    // Emphasize the two levels traders watch most — the 50% midpoint
    // and the 0.618 golden ratio — with a slightly heavier line.
    const key = L === 0.5 || L === 0.618;

    ctx.globalAlpha = item.opacity;
    ctx.strokeStyle = col;
    ctx.lineWidth = key ? 1.6 : 1;
    // +0.5 keeps the 1px lines crisp on the device pixel grid.
    ctx.beginPath();
    ctx.moveTo(xLeft, y + 0.5);
    ctx.lineTo(xRight, y + 0.5);
    ctx.stroke();

    if (!item.showLabels) continue;

    const label = `${formatFibLevel(L)}  ${formatFibPct(L)}`;
    const padX = 5;
    const chipH = 16;
    const chipW = ctx.measureText(label).width + padX * 2;
    // Sit the chip just left of the lines; if that would run off the
    // left edge, tuck it inside the level instead so it stays visible.
    let chipX = xLeft - chipW - 6;
    let textX = chipX + padX;
    if (chipX < 2) {
      chipX = xLeft + 6;
      textX = chipX + padX;
    }

    ctx.globalAlpha = item.opacity;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(chipX, y - chipH / 2, chipW, chipH, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, textX, y);
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
  if (item.marchingAnts) {
    // Snip preview: two-pass marching ants — black underneath, white on
    // top with a dash-offset so the alternation is visible on light
    // AND dark surfaces. Half-pixel offset for crisp 1px lines. A faint
    // dim wash inside indicates the captured region.
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineDashOffset = 5;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  } else {
    ctx.globalAlpha = item.opacity * 0.18;
    ctx.fillStyle = item.color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = item.opacity;
    ctx.strokeStyle = item.color;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }
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
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const angle = Math.atan2(dy, dx);

  // Head geometry: parametric in both length and width, capped at 45%
  // of total length so very short arrows don't become all head, and
  // floored so very thin arrows still read as arrows. The 0.72 aspect
  // ratio (width as fraction of length) gives a slender, "designed"
  // silhouette rather than the chunky 90° triangle a fixed-angle head
  // produces. Notch at 0.22 of head length pulls the back inward so
  // the head reads as a swept chevron, not a flat-based pyramid.
  const widthBoost = 1 + item.width / 30;
  const headLen = Math.max(12, Math.min(length * 0.22 * widthBoost, length * 0.45));
  const headHalfW = headLen * 0.36;
  const notchDepth = headLen * 0.22;

  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const perpX = -sinA;
  const perpY = cosA;

  const tipX = item.p2.x;
  const tipY = item.p2.y;
  const backX = item.p2.x - headLen * cosA;
  const backY = item.p2.y - headLen * sinA;
  const notchX = backX + notchDepth * cosA;
  const notchY = backY + notchDepth * sinA;
  const wingLX = backX + headHalfW * perpX;
  const wingLY = backY + headHalfW * perpY;
  const wingRX = backX - headHalfW * perpX;
  const wingRY = backY - headHalfW * perpY;

  ctx.save();
  ctx.strokeStyle = item.color;
  ctx.fillStyle = item.color;
  ctx.lineWidth = item.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Shaft stops at the notch — if we drew through to p2 the head fill
  // would overlap the shaft's round cap and give small arrows a visible
  // blob at the join. Ending at the notch makes the silhouette one
  // continuous shape.
  ctx.beginPath();
  ctx.moveTo(item.p1.x, item.p1.y);
  ctx.lineTo(notchX, notchY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(wingLX, wingLY);
  ctx.lineTo(notchX, notchY);
  ctx.lineTo(wingRX, wingRY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, item: Extract<Item, { kind: 'text' }>): void {
  ctx.save();
  ctx.fillStyle = item.color;
  // Honor the per-item font family stamped from the user's default-font
  // setting; fall back to the system stack for items saved before it.
  const family = item.fontFamily ?? 'system-ui, -apple-system, sans-serif';
  ctx.font = `${item.fontSize}px ${family}`;
  ctx.textBaseline = 'top';
  const lines = item.text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], item.at.x, item.at.y + i * item.fontSize * 1.2);
  }
  ctx.restore();
}
