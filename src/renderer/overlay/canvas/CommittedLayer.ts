import type { Item } from '../../../shared/types';
import { drawItem } from './drawItem';
import { drawHandles } from './handles';
import type { SnipRect } from '../store';

export class CommittedLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('CommittedLayer: 2D context unavailable');
    this.ctx = ctx;
    this.dpr = Math.max(window.devicePixelRatio || 1, 2);
    this.resize();
  }

  resize(): void {
    const { innerWidth: w, innerHeight: h } = window;
    this.dpr = Math.max(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  render(items: Item[], selectedId: string | null = null, snipRect: SnipRect | null = null): void {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    for (const item of items) drawItem(ctx, item);
    if (selectedId) {
      const sel = items.find((i) => i.id === selectedId);
      if (sel) drawHandles(ctx, sel);
    }
    if (snipRect) drawSnipSelection(ctx, snipRect);
    ctx.restore();
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}

function drawSnipSelection(ctx: CanvasRenderingContext2D, rect: SnipRect): void {
  ctx.save();
  // dark stroke under for contrast on light backgrounds
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = 0;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w, rect.h);
  // bright dashed line on top
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineDashOffset = 5;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w, rect.h);
  ctx.restore();
}
