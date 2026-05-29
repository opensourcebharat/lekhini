import type { Calibration, FibShape, Item, LineShape } from '../../../shared/types';
import { FIB_LEVELS } from '../../../shared/constants';

// Map a pixel Y to a price using the two calibration anchor points.
// Returns null when calibration is absent or degenerate.
function priceAtPixelY(pixelY: number, calib: Calibration | null): number | null {
  if (!calib) return null;
  const dyPix = calib.p2.pixel.y - calib.p1.pixel.y;
  if (dyPix === 0) return null;
  const t = (pixelY - calib.p1.pixel.y) / dyPix;
  return calib.p1.price + t * (calib.p2.price - calib.p1.price);
}

function fmtPrice(p: number): string {
  // A few significant digits without trailing noise.
  const abs = Math.abs(p);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 5;
  return p.toFixed(digits);
}

// Match drawItem's fib geometry: 0% sits at p2 (end of the move),
// 100% at p1 (origin). yAt(L) interpolates from p2 → p1.
function fibYAt(fib: FibShape, level: number): number {
  return fib.p2.y + (fib.p1.y - fib.p2.y) * level;
}

function describeFib(fib: FibShape, index: number, calib: Calibration | null): string {
  const levels = (fib.levels.length ? fib.levels : FIB_LEVELS).slice().sort((a, b) => a - b);
  // Screen Y grows downward, so the end point being higher on screen
  // (smaller y) means price moved UP into the swing high.
  const movedUp = fib.p2.y < fib.p1.y;
  const dir = movedUp ? 'up (swing low → swing high)' : 'down (swing high → swing low)';
  const lines: string[] = [`Fibonacci retracement #${index + 1} — move drawn ${dir}:`];
  for (const L of levels) {
    const pct = `${Number((L * 100).toFixed(1))}%`;
    const price = priceAtPixelY(fibYAt(fib, L), calib);
    const priceStr = price != null ? ` ≈ ${fmtPrice(price)}` : '';
    const tag = L === 0 ? ' (0% — end of move)' : L === 1 ? ' (100% — origin)' : '';
    lines.push(`  • ${pct}${priceStr}${tag}`);
  }
  return lines.join('\n');
}

function describeLine(line: LineShape, index: number, calib: Calibration | null): string {
  const kind = line.kind === 'trendline' ? 'Trendline' : 'Line';
  // Rising on screen = end point higher (smaller y) as x increases.
  const rising = line.p2.y < line.p1.y;
  const slope = line.kind === 'trendline' ? (rising ? ' (rising)' : ' (falling)') : '';
  const p1 = priceAtPixelY(line.p1.y, calib);
  const p2 = priceAtPixelY(line.p2.y, calib);
  const range =
    p1 != null && p2 != null ? ` from ≈ ${fmtPrice(p1)} to ≈ ${fmtPrice(p2)}` : '';
  return `${kind} #${index + 1}${slope}${range}`;
}

// Build the analysis prompt text from the user's drawn technical
// markup. Returns null when there's nothing analyzable on the canvas.
// The output is a self-contained user message: framing + the computed
// numbers, so the trader text model never has to read a chart image.
export function buildTradeAnalysisText(items: Item[], calib: Calibration | null): string | null {
  const fibs = items.filter((i): i is FibShape => i.kind === 'fib');
  const lines = items.filter(
    (i): i is LineShape => i.kind === 'line' || i.kind === 'trendline',
  );
  if (fibs.length === 0 && lines.length === 0) return null;

  const sections: string[] = [];
  fibs.forEach((f, i) => sections.push(describeFib(f, i, calib)));
  if (lines.length > 0) {
    sections.push(
      'Lines / trendlines:\n' +
        lines.map((l, i) => `  • ${describeLine(l, i, calib)}`).join('\n'),
    );
  }
  if (!calib) {
    sections.push(
      'Note: no price calibration is set, so levels are given as ' +
        'retracement ratios rather than absolute prices.',
    );
  }

  return (
    'These are the technical levels I have marked on my chart, computed ' +
    'numerically from my drawings (not read from an image — treat the ' +
    'numbers as exact):\n\n' +
    sections.join('\n\n') +
    '\n\nUsing only these levels, give a concise read: the prevailing ' +
    'trend, the key levels to watch, and one or two probabilistic ' +
    'scenarios with an invalidation level for each. Observation only — ' +
    'not financial advice.'
  );
}
