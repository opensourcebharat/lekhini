import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { CommittedLayer } from './canvas/CommittedLayer';
import { LiveLayer } from './canvas/LiveLayer';
import { attachPointerPipeline } from './canvas/pointerPipeline';
import { cursorFor } from './cursors';
import { store, type SnipRect } from './store';
import { buildRegistry } from './tools/registry';
import { nextId } from './tools/types';
import {
  dominantColor,
  groupBounds,
  HANDWRITING_FONT,
  isDescriptiveJunk,
  isLikelyQuestion,
  isRecognizableStroke,
  rasterizeGroup,
} from './canvas/recognize';
import { buildTradeAnalysisText } from './canvas/ta';
import type {
  Calibration,
  Item,
  ProfileId,
  StrokeItem,
  TextShape,
  Theme,
  ToolSettings,
  Whiteboard,
} from '../../shared/types';
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
  // AI-configuration mirror + current profile, used by the SnipActions
  // Ask AI button. Updated from hub.onBroadcast below.
  const [aiConfigured, setAiConfigured] = createSignal(false);
  const [activeProfile, setActiveProfile] = createSignal<ProfileId>('general');
  // Autocorrect + default-font settings, mirrored from the hub.
  const [autocorrectTyped, setAutocorrectTyped] = createSignal(false);
  const [autocorrectDrawn, setAutocorrectDrawn] = createSignal(false);
  const [defaultFont, setDefaultFont] = createSignal('system-ui, -apple-system, sans-serif');
  // Local AI usable = enabled with at least one model installed.
  const [aiLocalReady, setAiLocalReady] = createSignal(false);
  // Any AI path available (local or a configured cloud provider).
  const aiAvailable = () => aiLocalReady() || aiConfigured();
  let currentTheme: Theme = 'dark';
  // Latest pixel↔price calibration from the hub (null until set).
  let currentCalibration: Calibration | null = null;

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

    // ── Handwriting recognition controller ─────────────────────────
    // After the user FINISHES drawing pen/pencil ink (long idle, and
    // never while a stroke is in progress), the recent strokes are
    // rasterized and sent to the AI for transcription + correction, then
    // swapped for a single TextShape in one undo step. Gated by the
    // autocorrectDrawn setting and AI availability.
    //
    // The idle must be generous: people pause between letters/words, so
    // a short timer fires mid-word and overwrites half-written ink. We
    // wait ~2.2s of no drawing AND cancel any pending pass the moment a
    // new stroke starts (cancelRecognition on pointer-down).
    const RECOGNIZE_IDLE_MS = 2200;
    const recog = {
      pending: new Set<string>(),
      recognized: new Set<string>(),
      timer: null as ReturnType<typeof setTimeout> | null,
      inFlight: false,
    };

    const cancelRecognition = () => {
      if (recog.timer !== null) {
        clearTimeout(recog.timer);
        recog.timer = null;
      }
    };

    const scheduleRecognition = () => {
      cancelRecognition();
      recog.timer = setTimeout(() => {
        recog.timer = null;
        void runRecognition();
      }, RECOGNIZE_IDLE_MS);
    };

    const onStrokeCommitted = (item: Item) => {
      if (!autocorrectDrawn() || !aiAvailable()) return;
      if (!isRecognizableStroke(item)) return;
      recog.pending.add(item.id);
      scheduleRecognition();
    };

    const runRecognition = async () => {
      if (recog.inFlight) {
        scheduleRecognition();
        return;
      }
      if (!autocorrectDrawn()) {
        recog.pending.clear();
        return;
      }
      const byId = new Map(store.getState().items.map((i) => [i.id, i] as const));
      const group: StrokeItem[] = [];
      for (const id of recog.pending) {
        const it = byId.get(id);
        if (it && isRecognizableStroke(it) && !recog.recognized.has(id)) group.push(it);
      }
      recog.pending.clear();
      if (group.length === 0) return;
      const bounds = groupBounds(group);
      // Require a real bit of writing — a single tiny mark is almost
      // always an accidental tap, not a word worth transcribing.
      if (bounds.w < 24 || bounds.h < 10) return;
      // Claim these ids before the await so strokes drawn during the
      // request form a fresh batch and these are never re-sent.
      const ids = group.map((g) => g.id);
      ids.forEach((id) => recog.recognized.add(id));

      const dpr = Math.max(window.devicePixelRatio || 1, 2);
      const png = await canvasToPng(rasterizeGroup(group, bounds, dpr));

      recog.inFlight = true;
      let text = '';
      try {
        const res = await window.pen.ai.recognize({
          png,
          mime: 'image/png',
          profile: activeProfile(),
        });
        text = (res.text ?? '').trim();
      } catch {
        text = '';
      } finally {
        recog.inFlight = false;
      }
      // Strip wrapping quotes the model sometimes adds.
      text = text.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim();
      // Reject non-transcriptions: small vision models often DESCRIBE the
      // image ("a signature", "the user wrote…", "this appears to be
      // handwriting") instead of transcribing. Replacing the user's ink
      // with that is worse than doing nothing, so keep the ink instead.
      if (!text || isDescriptiveJunk(text)) return;

      // The user may have undone or erased the ink during the request —
      // only replace strokes that still exist.
      const live = new Set(store.getState().items.map((i) => i.id));
      const survivors = ids.filter((id) => live.has(id));
      if (survivors.length === 0) return;

      const textItem: TextShape = {
        kind: 'text',
        id: nextId('text'),
        at: { x: bounds.x, y: bounds.y },
        text,
        color: dominantColor(group),
        // Match the size the user actually drew (ink height), so the
        // replacement neither balloons nor shrinks. Rendered in a
        // handwriting font to stay realistic at that spot.
        fontSize: Math.min(200, Math.max(12, Math.round(bounds.h * 0.8))),
        fontFamily: HANDWRITING_FONT,
      };
      store.getState().replaceMany(survivors, [textItem]);

      // If the user hand-wrote a question/request, also answer it in
      // the chat panel — profile-aware (teacher explains, trader
      // analyzes) via the profile system prompt. The tidy text stays
      // on the canvas; the answer opens in the dock chat.
      if (isLikelyQuestion(text)) {
        void window.pen.chat.startText({ text, profile: activeProfile() });
      }
    };

    const ctx: ToolContext = {
      get settings() {
        return currentSettings;
      },
      profile: () => activeProfile(),
      defaultFont: () => defaultFont(),
      autocorrectTyped: () => autocorrectTyped(),
      items: () => store.getState().items,
      selectedId: () => store.getState().selectedId,
      setDraft(item: Item | null) {
        live.draft(item);
      },
      commit(item: Item) {
        store.getState().commit(item);
        onStrokeCommitted(item);
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
        // Starting a new stroke means the user isn't done writing —
        // cancel any pending recognition so it never fires mid-word and
        // overwrites half-finished ink.
        cancelRecognition();
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
    // Trader hybrid: compute the drawn fib / trendline levels as text
    // and open a text-only analysis chat (no chart image is sent).
    const unAnalyze = window.pen.overlay.onAnalyze(() => {
      const text = buildTradeAnalysisText(store.getState().items, currentCalibration);
      if (!text) return; // nothing drawn to analyze
      void window.pen.chat.startText({ text, profile: activeProfile() });
    });
    const unShot = window.pen.overlay.onScreenshot(async ({ png }) => {
      const out = await composite(png, committed.getCanvas());
      await window.pen.overlay.sendScreenshotResult(out);
    });
    const unSnip = window.pen.overlay.onSnip(async ({ png, rect, scaleFactor }) => {
      const out = await compositeAndCrop(png, committed.getCanvas(), rect, scaleFactor);
      await window.pen.overlay.sendSnipResult(out);
    });
    const unSnipSel = window.pen.overlay.onSnipSelection((rect) => {
      store.getState().setSnipRect(rect);
    });

    // Mirror the AI / autocorrect / font fields from a hub snapshot.
    type AiHubFields = {
      aiActiveProvider?: string | null;
      aiLocalEnabled?: boolean;
      aiInstalledModels?: string[];
      autocorrectTyped?: boolean;
      autocorrectDrawn?: boolean;
      defaultTextFont?: string;
    };
    const applyAiFields = (s: AiHubFields) => {
      if ('aiActiveProvider' in s) setAiConfigured(s.aiActiveProvider != null);
      if (typeof s.aiLocalEnabled === 'boolean' || Array.isArray(s.aiInstalledModels)) {
        setAiLocalReady(!!s.aiLocalEnabled && (s.aiInstalledModels?.length ?? 0) > 0);
      }
      if (typeof s.autocorrectTyped === 'boolean') setAutocorrectTyped(s.autocorrectTyped);
      if (typeof s.autocorrectDrawn === 'boolean') setAutocorrectDrawn(s.autocorrectDrawn);
      if (typeof s.defaultTextFont === 'string' && s.defaultTextFont.length > 0) {
        setDefaultFont(s.defaultTextFont);
      }
    };

    const unBroadcast = window.pen.hub.onBroadcast((state: unknown) => {
      const s = state as {
        activeTool?: string;
        drawMode?: boolean;
        settings?: Partial<ToolSettings>;
        whiteboard?: Whiteboard;
        theme?: Theme;
        thicknessFlyoutOpen?: boolean;
        profile?: ProfileId;
        calibration?: Calibration | null;
      } & AiHubFields;
      if ('calibration' in s) currentCalibration = s.calibration ?? null;
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
      applyAiFields(s);
      if (s.profile) setActiveProfile(s.profile);
    });

    void window.pen.hub.get().then((state) => {
      const s = state as {
        activeTool: string;
        drawMode: boolean;
        settings: ToolSettings;
        whiteboard: Whiteboard;
        theme?: Theme;
        thicknessFlyoutOpen?: boolean;
        profile?: ProfileId;
        calibration?: Calibration | null;
      } & AiHubFields;
      if ('calibration' in s) currentCalibration = s.calibration ?? null;
      store.getState().setActiveTool(s.activeTool as never);
      store.getState().setDrawMode(s.drawMode);
      store.getState().setSettings(s.settings);
      setWhiteboard(s.whiteboard);
      if (s.theme) currentTheme = s.theme;
      if (typeof s.thicknessFlyoutOpen === 'boolean') {
        toolbarFlyoutOpen = s.thicknessFlyoutOpen;
      }
      applyAiFields(s);
      if (s.profile) setActiveProfile(s.profile);
      applyCursor();
    });

    onCleanup(() => {
      detach();
      window.removeEventListener('resize', onResize);
      unsub();
      unUndo();
      unRedo();
      unClear();
      unAnalyze();
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
        {(rect) => (
          <SnipActions
            rect={rect()}
            aiConfigured={aiAvailable()}
            profile={activeProfile()}
          />
        )}
      </Show>
    </div>
  );
}

// Floating Copy / Save / Cancel menu for the active snip selection.
// Anchored at the bottom-right corner of the rect with a small offset.
// Falls back to inside-rect-bottom-right if the rect is too close to
// the screen edge to fit the menu below it.
function SnipActions(props: {
  rect: SnipRect;
  aiConfigured: boolean;
  profile: ProfileId;
}) {
  // Wider menu when the Ask AI button is showing so the four buttons
  // fit in one row without wrapping.
  const MENU_W = () => (props.aiConfigured ? 232 : 168);
  const MENU_H = 32;
  const GAP = 8;
  // Tracks an in-flight Copy / AskAi so the button can show its
  // busy label and block double-clicks. Save is fire-and-forget.
  const [busy, setBusy] = createSignal<'copy' | 'ask' | null>(null);

  const clearSnip = (): void => {
    const displayId = window.pen.env.displayId();
    void window.pen.snip.clear({ displayId });
  };
  // After the user picks Copy or Save the snip is done — drop the
  // overlay out of drawMode so it becomes click-through immediately,
  // letting the user paste into another app or click around without
  // the snip tool intercepting the next click. The snip tool stays
  // selected, so re-enabling drawMode (⌘⇧D or status dot) jumps
  // straight back into another selection.
  const exitToIdle = (): void => {
    void window.pen.hub.update({ drawMode: false });
  };
  const onCopy = async (): Promise<void> => {
    if (busy()) return;
    setBusy('copy');
    try {
      await window.pen.snip.copy();
    } finally {
      setBusy(null);
      clearSnip();
      exitToIdle();
    }
  };
  const onSave = (): void => {
    // The main process's captureFocusedDisplay picks up the existing
    // selection and writes a cropped PNG (going through the save
    // dialog or the remembered folder). capture.ts also clears the
    // visual selection itself just before grabbing the pixels so it
    // isn't baked into the PNG.
    void window.pen.relay.screenshot();
    exitToIdle();
  };
  const onAskAi = async (): Promise<void> => {
    if (busy()) return;
    setBusy('ask');
    try {
      // Main captures + composites + broadcasts chat:session →
      // toolbar's ChatPanel picks it up and fires the first AI turn.
      // Selection is cleared by capture.ts during the capture (same
      // path Save / Copy use).
      await window.pen.snip.askAi(props.profile);
    } finally {
      setBusy(null);
      // Don't exitToIdle here — the user might want to keep snipping
      // while chatting. The chat panel is in the toolbar window; the
      // overlay stays interactive.
    }
  };
  const onCancel = (): void => clearSnip();

  const positioned = (): { left: string; top: string } => {
    const r = props.rect;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const menuW = MENU_W();
    // Default: below the rect, right-aligned to its right edge.
    let left = r.x + r.w - menuW;
    let top = r.y + r.h + GAP;
    // If it would overflow the bottom of the screen, place ABOVE the rect.
    if (top + MENU_H > winH - 4) top = r.y - MENU_H - GAP;
    // If still off-screen (very tall rect near top), tuck inside the rect.
    if (top < 4) top = Math.min(r.y + r.h - MENU_H - GAP, winH - MENU_H - 4);
    // Horizontal clamping: never let the menu fall off either edge.
    left = Math.max(4, Math.min(left, winW - menuW - 4));
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
        disabled={busy() !== null}
        title="Copy the selection to the clipboard"
      >
        {busy() === 'copy' ? 'Copying…' : 'Copy'}
      </button>
      <button
        class="snip-action"
        onClick={onSave}
        disabled={busy() !== null}
        title="Save the selection as a PNG file"
      >
        Save
      </button>
      <Show when={props.aiConfigured}>
        <button
          class="snip-action snip-action-ai"
          onClick={() => void onAskAi()}
          disabled={busy() !== null}
          title="Send this snip to the AI for analysis"
        >
          {busy() === 'ask' ? 'Asking…' : 'Ask AI'}
        </button>
      </Show>
      <button
        class="snip-action snip-action-quiet"
        onClick={onCancel}
        disabled={busy() !== null}
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

// Composite the full-screen capture with the overlay's annotations,
// returning a PNG buffer. Uses createImageBitmap + canvas.toBlob —
// both run off-thread where the browser supports it, and avoid the
// expensive HTMLImageElement.src = dataURL round-trip that the
// previous string-based path used.
async function composite(
  screenPng: Uint8Array,
  annotationCanvas: HTMLCanvasElement,
): Promise<Uint8Array> {
  const bitmap = await pngToBitmap(screenPng);
  if (!bitmap) return new Uint8Array();
  const off = document.createElement('canvas');
  off.width = bitmap.width;
  off.height = bitmap.height;
  const ctx = off.getContext('2d');
  if (!ctx) return new Uint8Array();
  ctx.drawImage(bitmap, 0, 0);
  ctx.drawImage(annotationCanvas, 0, 0, off.width, off.height);
  bitmap.close();
  return canvasToPng(off);
}

async function compositeAndCrop(
  screenPng: Uint8Array,
  annotationCanvas: HTMLCanvasElement,
  rect: { x: number; y: number; w: number; h: number },
  scaleFactor: number,
): Promise<Uint8Array> {
  const bitmap = await pngToBitmap(screenPng);
  if (!bitmap) return new Uint8Array();

  // Composite the full display first so the annotation canvas (which
  // is sized to the overlay window, not to the screen capture) draws
  // at the same scale as the underlying pixels.
  const full = document.createElement('canvas');
  full.width = bitmap.width;
  full.height = bitmap.height;
  const fctx = full.getContext('2d');
  if (!fctx) {
    bitmap.close();
    return new Uint8Array();
  }
  fctx.drawImage(bitmap, 0, 0);
  fctx.drawImage(annotationCanvas, 0, 0, full.width, full.height);
  bitmap.close();

  // Then crop to the user's CSS-px rect, scaled to display pixels.
  const sx = Math.max(0, Math.round(rect.x * scaleFactor));
  const sy = Math.max(0, Math.round(rect.y * scaleFactor));
  const sw = Math.min(Math.round(rect.w * scaleFactor), full.width - sx);
  const sh = Math.min(Math.round(rect.h * scaleFactor), full.height - sy);
  if (sw <= 0 || sh <= 0) return new Uint8Array();

  const off = document.createElement('canvas');
  off.width = sw;
  off.height = sh;
  const ctx = off.getContext('2d');
  if (!ctx) return new Uint8Array();
  ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvasToPng(off);
}

async function pngToBitmap(png: Uint8Array): Promise<ImageBitmap | null> {
  try {
    // Cast through BlobPart — Uint8Array satisfies the structural
    // requirement at runtime, but TS's stricter ArrayBufferLike vs
    // ArrayBuffer split (post-5.7) complains without help.
    const blob = new Blob([png as BlobPart], { type: 'image/png' });
    return await createImageBitmap(blob);
  } catch (err) {
    console.warn('[pen] pngToBitmap failed', err);
    return null;
  }
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) return new Uint8Array();
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}
