import type { Item } from '../../../shared/types';

export function translateItem(item: Item, dx: number, dy: number): Item {
  switch (item.kind) {
    case 'stroke':
      return {
        ...item,
        points: item.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
      };
    case 'line':
    case 'trendline':
    case 'arrow':
    case 'region':
    case 'ellipse':
    case 'fib':
      return {
        ...item,
        p1: { x: item.p1.x + dx, y: item.p1.y + dy },
        p2: { x: item.p2.x + dx, y: item.p2.y + dy },
      };
    case 'text':
      return {
        ...item,
        at: { x: item.at.x + dx, y: item.at.y + dy },
      };
  }
}
