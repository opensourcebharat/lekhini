import type { Item } from '../../../shared/types';

export type HandleId = 'p1' | 'p2' | 'tl' | 'tr' | 'bl' | 'br';

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
}

export function getHandles(item: Item): Handle[] {
  switch (item.kind) {
    case 'line':
    case 'trendline':
    case 'arrow':
      return [
        { id: 'p1', x: item.p1.x, y: item.p1.y },
        { id: 'p2', x: item.p2.x, y: item.p2.y },
      ];
    case 'region':
    case 'ellipse': {
      const minX = Math.min(item.p1.x, item.p2.x);
      const maxX = Math.max(item.p1.x, item.p2.x);
      const minY = Math.min(item.p1.y, item.p2.y);
      const maxY = Math.max(item.p1.y, item.p2.y);
      return [
        { id: 'tl', x: minX, y: minY },
        { id: 'tr', x: maxX, y: minY },
        { id: 'bl', x: minX, y: maxY },
        { id: 'br', x: maxX, y: maxY },
      ];
    }
    case 'fib':
      return [
        { id: 'p1', x: (item.p1.x + item.p2.x) / 2, y: item.p1.y },
        { id: 'p2', x: (item.p1.x + item.p2.x) / 2, y: item.p2.y },
      ];
    case 'stroke':
    case 'text':
      return [];
  }
}

export function applyHandle(original: Item, hid: HandleId, x: number, y: number): Item {
  switch (original.kind) {
    case 'line':
    case 'trendline':
    case 'arrow':
      if (hid === 'p1') return { ...original, p1: { x, y } };
      if (hid === 'p2') return { ...original, p2: { x, y } };
      return original;
    case 'region':
    case 'ellipse': {
      const minX = Math.min(original.p1.x, original.p2.x);
      const maxX = Math.max(original.p1.x, original.p2.x);
      const minY = Math.min(original.p1.y, original.p2.y);
      const maxY = Math.max(original.p1.y, original.p2.y);
      let nl = minX, nr = maxX, nt = minY, nb = maxY;
      if (hid === 'tl') { nl = x; nt = y; }
      else if (hid === 'tr') { nr = x; nt = y; }
      else if (hid === 'bl') { nl = x; nb = y; }
      else if (hid === 'br') { nr = x; nb = y; }
      else return original;
      return { ...original, p1: { x: nl, y: nt }, p2: { x: nr, y: nb } };
    }
    case 'fib':
      if (hid === 'p1') return { ...original, p1: { x: original.p1.x, y: y } };
      if (hid === 'p2') return { ...original, p2: { x: original.p2.x, y: y } };
      return original;
    case 'stroke':
    case 'text':
      return original;
  }
}

export function hitHandle(item: Item, x: number, y: number, radius = 10): HandleId | null {
  for (const h of getHandles(item)) {
    if (Math.hypot(h.x - x, h.y - y) <= radius) return h.id;
  }
  return null;
}

export function drawHandles(ctx: CanvasRenderingContext2D, item: Item): void {
  const handles = getHandles(item);
  drawBoundingHint(ctx, item);
  ctx.save();
  for (const h of handles) {
    // outline
    ctx.beginPath();
    ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1f';
    ctx.fill();
    // dot
    ctx.beginPath();
    ctx.arc(h.x, h.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#5ac8fa';
    ctx.fill();
    // highlight ring
    ctx.beginPath();
    ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBoundingHint(ctx: CanvasRenderingContext2D, item: Item): void {
  if (item.kind === 'stroke' || item.kind === 'text') {
    const box = bboxOf(item);
    if (!box) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(90, 200, 250, 0.7)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8);
    ctx.restore();
  }
}

function bboxOf(item: Item): { x: number; y: number; w: number; h: number } | null {
  if (item.kind === 'stroke') {
    if (item.points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of item.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (item.kind === 'text') {
    const w = item.text.length * item.fontSize * 0.6;
    const h = item.fontSize * (item.text.split('\n').length || 1) * 1.2;
    return { x: item.at.x, y: item.at.y, w, h };
  }
  return null;
}
