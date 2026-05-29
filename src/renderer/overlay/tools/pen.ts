import type { Point, StrokeItem } from '../../../shared/types';
import type { Tool, ToolContext } from './types';
import { nextId } from './types';
import type { PointerSample } from '../canvas/pointerPipeline';

type StrokeTool = 'pencil' | 'pen' | 'highlighter';

function makeStroke(tool: StrokeTool, ctx: ToolContext, points: Point[]): StrokeItem {
  const { color, width, opacity } = ctx.settings;
  return {
    kind: 'stroke',
    id: nextId(tool),
    tool,
    points,
    color,
    width,
    opacity,
  };
}

function sampleToPoint(s: PointerSample): Point {
  return { x: s.x, y: s.y, p: s.p, t: s.t };
}

// Velocity-aware exponential moving average. Smooths input jitter while
// preserving fast strokes — at write-letter speeds the pointer barely
// moves between samples, which is exactly where unfiltered noise reads
// as wobble. perfect-freehand also smooths, but it operates on the
// downstream outline; pre-filtering the raw input fixes the cursor path
// itself, which is what handwriting actually traces.
class InputSmoother {
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private primed = false;

  reset(): void {
    this.primed = false;
  }

  push(p: Point, alphaFloor = 0.35): Point {
    if (!this.primed) {
      this.lastX = p.x;
      this.lastY = p.y;
      this.lastT = p.t;
      this.primed = true;
      return p;
    }
    const dt = Math.max(1, p.t - this.lastT);
    const dx = p.x - this.lastX;
    const dy = p.y - this.lastY;
    const speed = Math.sqrt(dx * dx + dy * dy) / dt; // px per ms

    // alpha approaches 1 (no smoothing) as speed grows. Slow handwriting
    // strokes ~ 0.3–0.6 px/ms; fast scribbles > 2 px/ms.
    const alpha = Math.min(1, alphaFloor + speed * 0.45);
    const x = this.lastX + alpha * dx;
    const y = this.lastY + alpha * dy;
    this.lastX = x;
    this.lastY = y;
    this.lastT = p.t;
    return { x, y, p: p.p, t: p.t };
  }
}

export function makePen(tool: StrokeTool): Tool {
  let working: StrokeItem | null = null;
  const smoother = new InputSmoother();
  // Higher alpha floor = the rendered point sits closer to the true
  // cursor, so the ink tracks the hand instead of trailing it. On a
  // mouse/trackpad (no real pressure, coarser sampling) precise
  // handwriting needs the line to land where the pointer actually is —
  // lag reads as imprecision. Pencil already tracked tightly (0.6);
  // pen is raised from 0.35 → 0.55 so it stops floating behind the
  // cursor. Remaining jitter is cleaned up by perfect-freehand's
  // streamline at commit time. Highlighter passes raw.
  const smoothingFloor = tool === 'pencil' ? 0.6 : tool === 'pen' ? 0.55 : 1;
  const useSmoother = tool !== 'highlighter';

  const filter = (p: Point): Point =>
    useSmoother ? smoother.push(p, smoothingFloor) : p;

  return {
    id: tool,
    onDown(sample, ctx) {
      smoother.reset();
      const filtered = filter(sampleToPoint(sample));
      working = makeStroke(tool, ctx, [filtered]);
      ctx.setDraft(working);
    },
    onMove(samples, ctx) {
      if (!working) return;
      const next = samples.map(sampleToPoint).map(filter);
      working.points.push(...next);
      // Pass the working item by reference — the LiveLayer reads and
      // draws it synchronously inside this call, so there's no need to
      // clone. The previous `{ ...working, points: [...] }` copied the
      // entire growing point array on every frame: O(n²) over a stroke,
      // which is what made long handwriting strokes lag progressively.
      ctx.setDraft(working);
    },
    onUp(sample, ctx) {
      if (!working) return;
      const filtered = filter(sampleToPoint(sample));
      working.points.push(filtered);
      const final = { ...working, points: [...working.points] };
      working = null;
      ctx.setDraft(null);
      if (final.points.length >= 2) ctx.commit(final);
    },
  };
}
