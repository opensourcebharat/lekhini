import type { Item, ProfileId, ToolSettings } from '../../../shared/types';
import type { PointerSample } from '../canvas/pointerPipeline';

export interface ToolContext {
  settings: ToolSettings;
  items(): Item[];
  selectedId(): string | null;
  setDraft(item: Item | null): void;
  commit(item: Item): void;
  commitShapeAndSelect(item: Item): void;
  remove(predicate: (item: Item) => boolean): void;
  setItem(id: string, next: Item): void;
  setSelected(id: string | null): void;
  snapshot(): void;
  requestFocus(): Promise<void>;
  releaseFocus(): Promise<void>;
  promptText(at: { x: number; y: number }, onCommit: (text: string) => void): void;
  drawMode(): boolean;
  // Active profile + text-styling/AI settings, read live by tools.
  profile(): ProfileId;
  defaultFont(): string;
  autocorrectTyped(): boolean;
}

export interface Tool {
  id: string;
  onDown(sample: PointerSample, ctx: ToolContext): void;
  onMove(samples: PointerSample[], ctx: ToolContext): void;
  onUp(sample: PointerSample, ctx: ToolContext): void;
}

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
