import type { Item, Point } from '../../../shared/types';

export function strokeNearPoint(points: Point[], x: number, y: number, radius: number): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (distToSegment(x, y, a, b) <= radius) return true;
  }
  return false;
}

export function distToSegment(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

export function itemHit(item: Item, x: number, y: number, radius = 8): boolean {
  switch (item.kind) {
    case 'stroke':
      return strokeNearPoint(item.points, x, y, Math.max(radius, item.width));
    case 'line':
    case 'trendline':
    case 'arrow':
      return distToSegment(x, y, item.p1, item.p2) <= radius;
    case 'region':
    case 'ellipse':
    case 'fib': {
      const minX = Math.min(item.p1.x, item.p2.x);
      const maxX = Math.max(item.p1.x, item.p2.x);
      const minY = Math.min(item.p1.y, item.p2.y);
      const maxY = Math.max(item.p1.y, item.p2.y);
      return x >= minX - 4 && x <= maxX + 4 && y >= minY - 4 && y <= maxY + 4;
    }
    case 'text': {
      const w = item.text.length * item.fontSize * 0.6;
      const h = item.fontSize * (item.text.split('\n').length || 1) * 1.2;
      return x >= item.at.x && x <= item.at.x + w && y >= item.at.y && y <= item.at.y + h;
    }
  }
}

export function findTopItemAt(items: Item[], x: number, y: number, radius = 10): Item | null {
  for (let i = items.length - 1; i >= 0; i--) {
    if (itemHit(items[i], x, y, radius)) return items[i];
  }
  return null;
}
