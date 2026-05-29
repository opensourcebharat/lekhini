import type { Item } from '../../../shared/types';
import { drawItem } from './drawItem';

export class LiveLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private pending: Item | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // `desynchronized: true` opts into the low-latency canvas path: the
    // browser is allowed to skip the normal compositor round-trip and
    // push our pixels to the screen with minimal buffering. This is the
    // single biggest lever for ink-to-screen latency on the live layer,
    // where the in-progress stroke is redrawn every pointer frame.
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) throw new Error('LiveLayer: 2D context unavailable');
    this.ctx = ctx;
    // Floor at 2× so strokes stay crisp on standard-DPI external monitors
    // (classroom IFPs are commonly 96 DPI / DPR 1) without ever downscaling
    // a true Retina or higher display. ~4× canvas memory vs DPR=1, which
    // is fine for one full-screen overlay.
    this.dpr = Math.max(window.devicePixelRatio || 1, 2);
    this.resize();
  }

  resize(): void {
    const { innerWidth: w, innerHeight: h } = window;
    // Floor at 2× so strokes stay crisp on standard-DPI external monitors
    // (classroom IFPs are commonly 96 DPI / DPR 1) without ever downscaling
    // a true Retina or higher display. ~4× canvas memory vs DPR=1, which
    // is fine for one full-screen overlay.
    this.dpr = Math.max(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // Renders synchronously. The pointer pipeline already coalesces all
  // moves within a frame into a single onMove → setDraft call (batched
  // on its own requestAnimationFrame), so a second rAF here only added
  // a wasted frame of latency. Drawing immediately on the current frame
  // is one fewer hop between the hand and the screen.
  draft(item: Item | null): void {
    this.pending = item;
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    if (this.pending) drawItem(ctx, this.pending, true);
    ctx.restore();
  }

  clear(): void {
    this.draft(null);
  }
}
