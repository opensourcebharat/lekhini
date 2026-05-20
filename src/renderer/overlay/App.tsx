import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { CommittedLayer } from './canvas/CommittedLayer';
import { LiveLayer } from './canvas/LiveLayer';
import { attachPointerPipeline } from './canvas/pointerPipeline';
import { cursorFor } from './cursors';
import { store, type SnipRect } from './store';
import { buildRegistry } from './tools/registry';
import type { Item, Theme, ToolSettings, Whiteboard } from '../../shared/types';
import type { Tool, ToolContext } from './tools/types';

export function OverlayApp() {
  let committedCanvas: HTMLCanvasElement | undefined;
  let liveCanvas: HTMLCanvasElement | undefined;
  let surface: HTMLDivElement | undefined;
  const [drawMode, setDrawMode] = createSignal(store.getState().drawMode);
  const [activeTool, setActiveToolSignal] = createSignal(store.getState().activeTool);
  const [whiteboard, setWhiteboard] = createSignal<Whiteboard>('off');
  // Reactive mirror of the store's snipRect so the SnipActions menu
  // can re-render on Solid's signal cycle. Synced inside the store
  // subscriber below.
  const [snipRectSig, setSnipRectSig] = createSignal<SnipRect | null>(null);
  let currentTheme: Theme = 'dark';

  const applyCursor = () => {
    if (!surface) return;
    const s = store.getState();
    surface.style.cursor = cursorFor(s.activeTool, s.settings.color, s.settings.width, currentTheme);
  };
  const [prompt, setPrompt] = createSignal<{
    x: number;
    y: number;
    onCommit: (s: string) => void;
  } | null>(null);

  onMount(() => {
    if (!committedCanvas || !liveCanvas || !surface) return;
    const committed = new CommittedLayer(committedCanvas);
    const live = new LiveLayer(liveCanvas);
    const tools = buildRegistry();

    let currentTool: Tool = tools[store.getState().activeTool];
    let currentSettings: ToolSettings = store.getState().settings;

    committed.render(
      store.getState().items,
      store.getState().selectedId,
      store.getState().snipRect,
    );

    const ctx: ToolContext = {
      get settings() {
        return currentSettings;
      },
      items: () => store.getState().items,
      selectedId: () => store.getState().selectedId,
      setDraft(item: Item | null) {
        live.draft(item);
      },
      commit(item: Item) {
        store.getState().commit(item);
      },
      commitShapeAndSelect(item: Item) {
        store.getState().commit(item);
        store.getState().setSelected(item.id);
        void window.pen.hub.update({ activeTool: 'hand', drawMode: true });
      },
      remove(predicate: (item: Item) => boolean) {
        for (const item of store.getState().items) {
          if (predicate(item)) store.getState().remove(item.id);
        }
      },
      setItem(id: string, next: Item) {
        store.getState().setItem(id, next);
      },
      setSelected(id: string | null) {
        store.getState().setSelected(id);
      },
      snapshot() {
        store.getState().snapshot();
      },
      requestFocus: () => window.pen.overlay.requestFocus(),
      releaseFocus: () => window.pen.overlay.releaseFocus(),
      promptText(at, onCommit) {
        setPrompt({ x: at.x, y: at.y, onCommit });
      },
      drawMode: () => drawMode(),
    };

    let toolbarFlyoutOpen = false;
    const detach = attachPointerPipeline(surface, {
      onDown(s, e) {
        if (!drawMode()) return;
        e.preventDefault();
        // The user is starting an actual stroke — close any thickness
        // popup that was left open on the toolbar so it doesn't hover
        // over the drawing surface. Cheap; only fires when the popup
        // is actually open.
        if (toolbarFlyoutOpen) {
          toolbarFlyoutOpen = false;
          void window.pen.hub.update({ thicknessFlyoutOpen: false });
        }
        currentTool.onDown(s, ctx);
      },
      onMove(samples) {
        if (!drawMode()) return;
        currentTool.onMove(samples, ctx);
      },
      onUp(s) {
        if (!drawMode()) return;
        currentTool.onUp(s, ctx);
      },
    });

    applyCursor();
    const unsub = store.subscribe((state, prev) => {
      currentSettings = state.settings;
      if (state.activeTool !== prev.activeTool) {
        currentTool = tools[state.activeTool];
        setActiveToolSignal(state.activeTool);
        live.clear();
        // Clear selection when leaving hand tool (e.g., picking pen)
        if (state.activeTool !== 'hand' && state.selectedId) {
          store.getState().setSelected(null);
        }
      }
      if (
        state.activeTool !== prev.activeTool ||
        state.settings.color !== prev.settings.color ||
        state.settings.width !== prev.settings.width
      ) {
        applyCursor();
      }
      if (state.drawMode !== prev.drawMode) setDrawMode(state.drawMode);
      if (
        state.items !== prev.items ||
        state.selectedId !== prev.selectedId ||
        state.snipRect !== prev.snipRect
      ) {
        committed.render(state.items, state.selectedId, state.snipRect);
      }
      if (state.snipRect !== prev.snipRect) setSnipRectSig(state.snipRect);
    });

    const onResize = () => {
      committed.resize();
      live.resize();
      committed.render(
      store.getState().items,
      store.getState().selectedId,
      store.getState().snipRect,
    );
    };
    window.addEventListener('resize', onResize);

    const unUndo = window.pen.overlay.onUndo(() => store.getState().undo());
    const unRedo = window.pen.overlay.onRedo(() => store.getState().redo());
    const unClear = window.pen.overlay.onClear(() => store.getState().clear());
    const unShot = window.pen.overlay.onScreenshot(async ({ dataUrl }) => {
      const png = await composite(dataUrl, committed.getCanvas());
      await window.pen.overlay.sendScreenshotResult(png);
    });
    const unSnip = window.pen.overlay.onSnip(async ({ dataUrl, rect, scaleFactor }) => {
      const png = await compositeAndCrop(dataUrl, committed.getCanvas(), rect, scaleFactor);
      await window.pen.overlay.sendSnipResult(png);
    });
    const unSnipSel = window.pen.overlay.onSnipSelection((rect) => {
      store.getState().setSnipRect(rect);
    });

    const unBroadcast = window.pen.hub.onBroadcast((state: unknown) => {
      const s = state as {
        activeTool?: string;
        drawMode?: boolean;
        settings?: Partial<ToolSettings>;
        whiteboard?: Whiteboard;
        theme?: Theme;
        thicknessFlyoutOpen?: boolean;
      };
      if (s.activeTool) store.getState().setActiveTool(s.activeTool as never);
      if (typeof s.drawMode === 'boolean') store.getState().setDrawMode(s.drawMode);
      if (s.settings) store.getState().setSettings(s.settings);
      if (s.whiteboard !== undefined) setWhiteboard(s.whiteboard);
      if (s.theme && s.theme !== currentTheme) {
        currentTheme = s.theme;
        applyCursor();
      }
      if (typeof s.thicknessFlyoutOpen === 'boolean') {
        toolbarFlyoutOpen = s.thicknessFlyoutOpen;
      }
    });

    void window.pen.hub.get().then((state) => {
      const s = state as {
        activeTool: string;
        drawMode: boolean;
        settings: ToolSettings;
        whiteboard: Whiteboard;
        theme?: Theme;
        thicknessFlyoutOpen?: boolean;
      };
      store.getState().setActiveTool(s.activeTool as never);
      store.getState().setDrawMode(s.drawMode);
      store.getState().setSettings(s.settings);
      setWhiteboard(s.whiteboard);
      if (s.theme) currentTheme = s.theme;
      if (typeof s.thicknessFlyoutOpen === 'boolean') {
        toolbarFlyoutOpen = s.thicknessFlyoutOpen;
      }
      applyCursor();
    });

    onCleanup(() => {
      detach();
      window.removeEventListener('resize', onResize);
      unsub();
      unUndo();
      unRedo();
      unClear();
      unShot();
      unSnip();
      unSnipSel();
      unBroadcast();
    });
  });

  return (
    <div class="overlay-root">
      <Show when={whiteboard() !== 'off'}>
        <div
          class="board"
          style={{ background: whiteboard() === 'white' ? '#ffffff' : '#111114' }}
        />
      </Show>
      <canvas ref={committedCanvas} />
      <canvas ref={liveCanvas} />
      <div
        ref={surface}
        class="capture-surface"
        data-draw={drawMode() ? 'true' : 'false'}
        data-tool={activeTool()}
      />
      <Show when={prompt()}>
        {(p) => (
          <TextPrompt
            x={p().x}
            y={p().y}
            onCommit={(s) => {
              p().onCommit(s);
              setPrompt(null);
            }}
            onCancel={() => {
              p().onCommit('');
              setPrompt(null);
            }}
          />
        )}
      </Show>
      {/* Menu is only operable while the snip tool is the active
          drawing tool, because the overlay window is click-through
          otherwise (setIgnoreMouseEvents). Hiding it then prevents a
          visible-but-dead menu floating on screen. The underlying
          selection stays in main's snipSelections map either way.
          (Order matters: snipRectSig() goes last so the && chain
          resolves to the SnipRect itself for Show's accessor.) */}
      <Show when={drawMode() && activeTool() === 'snip' && snipRectSig()}>
        {(rect) => <SnipActions rect={rect()} />}
      </Show>
    </div>
  );
}

// Floating Copy / Save / Cancel menu for the active snip selection.
// Anchored at the bottom-right corner of the rect with a small offset.
// Falls back to inside-rect-bottom-right if the rect is too close to
// the screen edge to fit the menu below it.
function SnipActions(props: { rect: SnipRect }) {
  const MENU_W = 168;
  const MENU_H = 32;
  const GAP = 8;
  const clearSnip = (): void => {
    const displayId = window.pen.env.displayId();
    void window.pen.snip.clear({ displayId });
  };
  const onCopy = async (): Promise<void> => {
    await window.pen.snip.copy();
    clearSnip();
  };
  const onSave = (): void => {
    // The main process's captureFocusedDisplay picks up the existing
    // selection and writes a cropped PNG (going through the save
    // dialog or the remembered folder).
    void window.pen.relay.screenshot();
    // Don't clear the selection here — capture.ts clears the visual
    // selection itself just before grabbing the pixels so it isn't
    // baked into the PNG, then we let the user know via the titlebar
    // hint in the toolbar window.
  };
  const onCancel = (): void => clearSnip();

  const positioned = (): { left: string; top: string } => {
    const r = props.rect;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    // Default: below the rect, right-aligned to its right edge.
    let left = r.x + r.w - MENU_W;
    let top = r.y + r.h + GAP;
    // If it would overflow the bottom of the screen, place ABOVE the rect.
    if (top + MENU_H > winH - 4) top = r.y - MENU_H - GAP;
    // If still off-screen (very tall rect near top), tuck inside the rect.
    if (top < 4) top = Math.min(r.y + r.h - MENU_H - GAP, winH - MENU_H - 4);
    // Horizontal clamping: never let the menu fall off either edge.
    left = Math.max(4, Math.min(left, winW - MENU_W - 4));
    return { left: `${left}px`, top: `${top}px` };
  };

  return (
    <div
      class="snip-actions"
      style={positioned()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        class="snip-action snip-action-primary"
        onClick={() => void onCopy()}
        title="Copy the selection to the clipboard"
      >
        Copy
      </button>
      <button
        class="snip-action"
        onClick={onSave}
        title="Save the selection as a PNG file"
      >
        Save
      </button>
      <button
        class="snip-action snip-action-quiet"
        onClick={onCancel}
        title="Discard the selection"
        aria-label="Cancel"
      >
        ✕
      </button>
    </div>
  );
}

function TextPrompt(props: { x: number; y: number; onCommit: (s: string) => void; onCancel: () => void }) {
  let input: HTMLInputElement | undefined;
  onMount(() => input?.focus());
  return (
    <input
      ref={input}
      class="text-prompt"
      style={{ left: `${props.x}px`, top: `${props.y - 14}px` }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') props.onCommit((e.currentTarget as HTMLInputElement).value);
        if (e.key === 'Escape') props.onCancel();
      }}
    />
  );
}

async function composite(screenDataUrl: string, annotationCanvas: HTMLCanvasElement): Promise<string> {
  const img = await loadImage(screenDataUrl);
  const off = document.createElement('canvas');
  off.width = img.naturalWidth;
  off.height = img.naturalHeight;
  const ctx = off.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(img, 0, 0);
  ctx.drawImage(annotationCanvas, 0, 0, off.width, off.height);
  const dataUrl = off.toDataURL('image/png');
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

async function compositeAndCrop(
  screenDataUrl: string,
  annotationCanvas: HTMLCanvasElement,
  rect: { x: number; y: number; w: number; h: number },
  scaleFactor: number,
): Promise<string> {
  const img = await loadImage(screenDataUrl);

  // First composite full display: screen + annotations scaled to screen pixels.
  const full = document.createElement('canvas');
  full.width = img.naturalWidth;
  full.height = img.naturalHeight;
  const fctx = full.getContext('2d');
  if (!fctx) return '';
  fctx.drawImage(img, 0, 0);
  fctx.drawImage(annotationCanvas, 0, 0, full.width, full.height);

  // Then crop to the user's CSS-px rect, scaled to display pixels.
  const sx = Math.max(0, Math.round(rect.x * scaleFactor));
  const sy = Math.max(0, Math.round(rect.y * scaleFactor));
  const sw = Math.min(Math.round(rect.w * scaleFactor), full.width - sx);
  const sh = Math.min(Math.round(rect.h * scaleFactor), full.height - sy);
  if (sw <= 0 || sh <= 0) return '';

  const off = document.createElement('canvas');
  off.width = sw;
  off.height = sh;
  const ctx = off.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  const dataUrl = off.toDataURL('image/png');
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
