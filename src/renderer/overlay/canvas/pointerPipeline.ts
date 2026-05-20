export interface PointerSample {
  x: number;
  y: number;
  p: number;
  t: number;
  shift: boolean;
  alt: boolean;
}

export type PointerPhase = 'down' | 'move' | 'up';

export interface PipelineHandlers {
  onDown(sample: PointerSample, e: PointerEvent): void;
  onMove(samples: PointerSample[], e: PointerEvent): void;
  onUp(sample: PointerSample, e: PointerEvent): void;
}

export function attachPointerPipeline(target: HTMLElement, handlers: PipelineHandlers): () => void {
  let drawing = false;
  let buffer: PointerSample[] = [];
  let rafId: number | null = null;
  let lastMoveEvent: PointerEvent | null = null;

  const flush = () => {
    rafId = null;
    if (!drawing || buffer.length === 0 || !lastMoveEvent) return;
    const samples = buffer;
    buffer = [];
    handlers.onMove(samples, lastMoveEvent);
  };

  const schedule = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(flush);
  };

  const toSample = (e: PointerEvent): PointerSample => ({
    x: e.clientX,
    y: e.clientY,
    p: e.pressure > 0 ? e.pressure : 0.5,
    t: e.timeStamp,
    shift: e.shiftKey,
    alt: e.altKey,
  });

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    drawing = true;
    target.setPointerCapture(e.pointerId);
    handlers.onDown(toSample(e), e);
  };

  const onMove = (e: PointerEvent) => {
    if (!drawing) return;
    lastMoveEvent = e;
    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (coalesced.length > 0) {
      for (const ce of coalesced) buffer.push(toSample(ce));
    } else {
      buffer.push(toSample(e));
    }
    schedule();
  };

  const onUp = (e: PointerEvent) => {
    if (!drawing) return;
    drawing = false;
    try {
      target.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (buffer.length > 0 && lastMoveEvent) {
      const samples = buffer;
      buffer = [];
      handlers.onMove(samples, lastMoveEvent);
    }
    handlers.onUp(toSample(e), e);
  };

  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onUp);

  return () => {
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);
    target.removeEventListener('pointercancel', onUp);
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}
