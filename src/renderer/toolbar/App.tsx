import { createEffect, createMemo, createSignal, For, onMount, onCleanup, Show } from 'solid-js';
import { COLOR_PRESETS, THICKNESS_PRESETS } from '../../shared/constants';
import { PROFILES, PROFILE_ORDER } from '../../shared/profiles';
import type {
  Orientation,
  ProfileId,
  Theme,
  ToolId,
  ToolSettings,
  Whiteboard,
} from '../../shared/types';
import { Icons, Logo } from './icons';

// Status-panel discriminator. Both kinds reuse the existing
// .settings-panel layout slot so they feel native to the toolbar
// instead of floating as an out-of-place modal.
type PanelKind = 'permission' | 'error';

interface HubSnapshot {
  activeTool: ToolId;
  drawMode: boolean;
  settings: ToolSettings;
  orientation: Orientation;
  minimized: boolean;
  whiteboard: Whiteboard;
  theme: Theme;
  profile: ProfileId;
  settingsOpen: boolean;
  thicknessFlyoutOpen: boolean;
  perToolWidth: { pencil: number; pen: number; eraser: number; highlighter: number };
  saveDir: string | null;
  alwaysAskSavePath: boolean;
  statusPanelOpen: boolean;
}

type FlyoutTool = 'pencil' | 'pen' | 'eraser' | 'highlighter';
const FLYOUT_TOOLS = new Set<ToolId>(['pencil', 'pen', 'eraser', 'highlighter']);
const isFlyoutTool = (id: ToolId): id is FlyoutTool => FLYOUT_TOOLS.has(id);

interface ToolDef {
  id: ToolId;
  label: string;
  hint: string;
  icon: () => ReturnType<(typeof Icons)['pen']>;
}

const ALL_TOOLS: ToolDef[] = [
  { id: 'pencil',      label: 'Pencil',      hint: 'Q',          icon: Icons.pencil },
  { id: 'pen',         label: 'Pen',         hint: 'P',          icon: Icons.pen },
  { id: 'eraser',      label: 'Eraser',      hint: 'E',          icon: Icons.eraser },
  { id: 'hand',        label: 'Hand (move)', hint: 'M',          icon: Icons.hand },
  { id: 'highlighter', label: 'Highlighter', hint: 'H',          icon: Icons.highlighter },
  { id: 'line',        label: 'H/V Line',    hint: 'L',          icon: Icons.line },
  { id: 'trendline',   label: 'Trendline',   hint: 'T · ⇧ snap', icon: Icons.trendline },
  { id: 'arrow',       label: 'Arrow',       hint: 'A',          icon: Icons.arrow },
  { id: 'text',        label: 'Text',        hint: 'X',          icon: Icons.text },
  { id: 'region',      label: 'Rectangle',   hint: 'R',          icon: Icons.region },
  { id: 'ellipse',     label: 'Ellipse',     hint: 'O',          icon: Icons.ellipse },
  { id: 'fib',         label: 'Fibonacci',   hint: 'F',          icon: Icons.fib },
  { id: 'snip',        label: 'Snip',        hint: 'C · ⇧ save', icon: Icons.snip },
];

const TOOL_BY_ID: Record<ToolId, ToolDef> = ALL_TOOLS.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<ToolId, ToolDef>,
);

// Permission-panel hint copy. When probeError=true, desktopCapturer
// outright threw on the recheck attempt — the process can't pick the
// new TCC state up without a relaunch.
function stuckHint(probeError: boolean): string {
  if (probeError) {
    return (
      "macOS can't refresh the permission for a running process — " +
      'Click Relaunch to restart Lekhini and pick up the change.'
    );
  }
  return (
    "Still off. Make sure Lekhini is toggled on under Privacy & Security " +
    '→ Screen Recording, then click Recheck.'
  );
}

// Display-friendly path: replace the home dir with `~` and ellipsize
// the middle if the result is still long. Pure cosmetic — the toast
// is narrow and a full POSIX path overflows.
function shortenPath(p: string, max = 56): string {
  let s = p;
  // Best-effort home detection — `process.env.HOME` is not available
  // in the renderer; fall back to the common macOS / Linux prefix.
  const home = /^\/Users\/[^/]+/.exec(s)?.[0] ?? /^\/home\/[^/]+/.exec(s)?.[0];
  if (home && s.startsWith(home)) s = '~' + s.slice(home.length);
  if (s.length <= max) return s;
  const tail = s.slice(-(max - 3));
  return '…' + tail;
}

export function ToolbarApp() {
  const [hub, setHub] = createSignal<HubSnapshot>({
    activeTool: 'pencil',
    drawMode: false,
    settings: { color: '#3a3a3c', width: 3, opacity: 1 },
    orientation: 'v',
    minimized: false,
    whiteboard: 'off',
    theme: 'dark',
    profile: 'general',
    settingsOpen: false,
    thicknessFlyoutOpen: false,
    perToolWidth: { pencil: 3, pen: 4, eraser: 20, highlighter: 18 },
    saveDir: null,
    alwaysAskSavePath: false,
    statusPanelOpen: false,
  });
  // Status-panel state. Mutually exclusive with the settings panel —
  // when one opens, the layout slot belongs to it. `panelError` holds
  // the message body when panelKind === 'error'; `panelHint` is a
  // small inline note shown under the body after a manual Recheck
  // returns the same denied status.
  const [panelKind, setPanelKind] = createSignal<PanelKind | null>(null);
  const [panelError, setPanelError] = createSignal<string | null>(null);
  const [panelHint, setPanelHint] = createSignal<string | null>(null);
  // True after a recheck attempt where desktopCapturer.getSources()
  // outright threw — process is stuck until relaunch. Drives the
  // panel to promote the Relaunch button over Recheck.
  const [permStuck, setPermStuck] = createSignal(false);
  // Set by capture:saved so the titlebar hint becomes a clickable
  // 'Reveal' that opens the file's folder. Cleared on next hover hint
  // or after revealMs.
  const [revealPath, setRevealPath] = createSignal<string | null>(null);
  let revealTimer: number | null = null;
  const [platform, setPlatform] = createSignal<NodeJS.Platform>('darwin');
  const [hint, setHint] = createSignal<string>('');
  const [settingsOnLeft, setSettingsOnLeft] = createSignal(false);
  const [appInfo, setAppInfo] = createSignal<{
    name: string;
    version: string;
    packaged: boolean;
  }>({
    name: 'Lekhini',
    version: '1.0.0',
    packaged: true,
  });
  let scrollRef: HTMLDivElement | undefined;
  let barMainRef: HTMLDivElement | undefined;

  onMount(() => {
    void window.pen.hub.get().then((state) => {
      const s = state as HubSnapshot;
      setHub(s);
      if (s.settingsOpen) refreshSide();
    });
    void window.pen.win.platform().then(setPlatform);
    void window.pen.app.info().then(setAppInfo);
    const off = window.pen.hub.onBroadcast((state) => {
      const s = state as HubSnapshot;
      setHub(s);
      // Re-evaluate which side the settings panel should sit on whenever the
      // toolbar bounds may have shifted (orientation/minimize/settingsOpen).
      if (s.settingsOpen) refreshSide();
    });
    onCleanup(off);

    // ── Permission + capture event wiring ────────────────────────
    // The main process emits 'permissions:needed' when a capture can't
    // proceed, and 'capture:saved' / 'capture:error' after each
    // attempt. We surface permission + error states as side panels
    // (same slot as Settings), and successful saves as a brief
    // clickable hint in the titlebar — much calmer than a floating
    // toast inside a tiny toolbar window.
    const offNeeded = window.pen.permissions.onNeeded(() => {
      setPanelHint(null);
      setPermStuck(false);
      setPanelKind('permission');
      // Close settings if it was occupying the slot.
      if (hub().settingsOpen) void window.pen.hub.update({ settingsOpen: false });
    });
    const offStatus = window.pen.permissions.onStatus((p) => {
      if (p.screen === 'granted') {
        setPanelKind((k) => (k === 'permission' ? null : k));
        setPanelHint(null);
        setPermStuck(false);
      } else if (panelKind() === 'permission') {
        setPermStuck(!!p.probeError);
        setPanelHint(stuckHint(!!p.probeError));
      }
    });
    const offSaved = window.pen.capture.onSaved((p) => {
      // If we were showing an error panel, the user just successfully
      // saved (e.g. via 'Pick new folder') — close the panel.
      setPanelKind((k) => (k === 'error' ? null : k));
      setPanelError(null);
      // Inline confirmation in the titlebar hint, auto-clears at 4s.
      setRevealPath(p.path);
      setHint(`Saved · ${shortenPath(p.path)}`);
      if (revealTimer !== null) window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(() => {
        setRevealPath(null);
        setHint('');
        revealTimer = null;
      }, 4000);
    });
    const offError = window.pen.capture.onError((p) => {
      setPanelError(p.message);
      setPanelKind('error');
      if (hub().settingsOpen) void window.pen.hub.update({ settingsOpen: false });
    });
    window.addEventListener('focus', onWindowFocus);
    onCleanup(() => {
      offNeeded();
      offStatus();
      offSaved();
      offError();
      window.removeEventListener('focus', onWindowFocus);
      if (revealTimer !== null) window.clearTimeout(revealTimer);
    });

    const el = scrollRef;
    if (!el) return;

    let isDown = false;
    let moved = 0;
    let startY = 0;
    let startScroll = 0;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, input, .swatch, .hex-pick')) return;
      isDown = true;
      moved = 0;
      startY = e.clientY;
      startScroll = el.scrollTop;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      if (!isDown) return;
      const dy = e.clientY - startY;
      moved = Math.max(moved, Math.abs(dy));
      el.scrollTop = startScroll - dy;
    };
    const onUp = (e: PointerEvent) => {
      if (!isDown) return;
      isDown = false;
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      el.style.cursor = '';
      if (moved > 4) e.preventDefault();
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);

    // Close the thickness flyout on Esc or any click outside its chips/buttons.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && hub().thicknessFlyoutOpen) closeFlyout();
    };
    const onDocDown = (e: PointerEvent) => {
      if (!hub().thicknessFlyoutOpen) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // Don't dismiss when the click landed on the popup, the thickness
      // trigger button, or any tool button (tool change closes the popup
      // on its own anyway).
      if (t.closest('.thickness-popup, .thickness-trigger, .tool-btn')) return;
      closeFlyout();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDocDown, true);

    onCleanup(() => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDocDown, true);
    });
  });

  // Adapt the toolbar window height to its content. bar-main is
  // content-sized, so we sum each child's natural height (using
  // scrollHeight for scroll-area). When the settings panel is open we
  // include it too — stacked vertically in h-mode (column flex bar),
  // side-by-side in v-mode (row flex bar, so we take the taller side).
  let lastReported = 0;
  const reportContentSize = () => {
    if (!barMainRef) return;
    const s = hub();
    if (s.minimized) return;

    let barMainHeight = 0;
    for (const child of Array.from(barMainRef.children)) {
      const el = child as HTMLElement;
      const isScroll = el.classList.contains('scroll-area');
      // scroll-area's clientHeight can track the window allotment, so
      // use scrollHeight to get the natural content height.
      barMainHeight += isScroll ? el.scrollHeight : el.offsetHeight;
    }

    let target = barMainHeight;
    // Settings panel and status panel both render with class
    // .settings-panel; whichever is open occupies the dock slot.
    if (s.settingsOpen || s.statusPanelOpen) {
      const sidePanel = barMainRef.parentElement?.querySelector(
        '.settings-panel',
      ) as HTMLElement | null;
      if (sidePanel) {
        const sideHeight = sidePanel.scrollHeight;
        target =
          s.orientation === 'h'
            ? barMainHeight + sideHeight
            : Math.max(barMainHeight, sideHeight);
      }
    }
    // 2px for the bar's 1px border on each side.
    target += 2;
    if (target === lastReported || target < 60) return;
    lastReported = target;
    void window.pen.win.setContentSize({ axis: 'v', size: target });
  };

  // Re-measure after the DOM has settled following any state change that
  // affects content size. RAF defers to after Solid flushes its updates.
  createEffect(() => {
    const s = hub();
    // Reading these fields explicitly tracks them.
    void s.orientation;
    void s.minimized;
    void s.settingsOpen;
    void s.statusPanelOpen;
    void s.thicknessFlyoutOpen;
    void s.profile;
    void s.activeTool;
    void panelKind();
    // First RAF catches the common case (single-frame layout). A
    // second RAF after it covers transitions where the bar-main was
    // just unmounted-then-remounted (notably restore from
    // minimized) — children sometimes need an extra frame to lay out
    // their final size, and without this the footer would render
    // clipped below the window's content-size until the next
    // unrelated re-measure.
    requestAnimationFrame(() => {
      reportContentSize();
      requestAnimationFrame(reportContentSize);
    });
  });

  // Refresh which side the panel sits on whenever a status panel opens
  // (mirrors the same logic the settings-open broadcast uses).
  createEffect(() => {
    if (panelKind() !== null) refreshSide();
  });

  // Push panelKind open/close into the hub so main resizes the
  // toolbar window to fit. Avoid an immediate redundant patch on
  // first mount where both sides are already false.
  createEffect(() => {
    const open = panelKind() !== null;
    if (open !== hub().statusPanelOpen) {
      void window.pen.hub.update({ statusPanelOpen: open });
    }
  });

  // Whenever a side panel flips open, ask main which side of the screen
  // we're on so we can render the panel on the correct side in vertical mode.
  const refreshSide = () => {
    void window.pen.win.toolbarOnRightSide().then(setSettingsOnLeft);
  };
  const closeFlyout = () =>
    void window.pen.hub.update({ thicknessFlyoutOpen: false });
  const setTool = (id: ToolId) => {
    const s = hub();
    if (s.activeTool === id) {
      // Re-clicking the active tool toggles drawMode — gives the user
      // a fast way back to idle without hunting for the status dot.
      // Thickness selection is no longer tied to tool clicks; it lives
      // in its own button.
      void window.pen.hub.update({
        drawMode: !s.drawMode,
        thicknessFlyoutOpen: false,
      });
    } else {
      void window.pen.hub.update({
        activeTool: id,
        drawMode: true,
        thicknessFlyoutOpen: false,
      });
    }
  };
  const setColor = (c: string) => void window.pen.hub.update({ settings: { color: c } });
  const pickThickness = (n: number) =>
    void window.pen.hub.update({ settings: { width: n } });
  const toggleThickness = () => {
    if (!isFlyoutTool(hub().activeTool)) return;
    void window.pen.hub.update({ thicknessFlyoutOpen: !hub().thicknessFlyoutOpen });
  };
  const toggleDraw = () => void window.pen.hub.update({ drawMode: !hub().drawMode });
  const toggleOrient = () =>
    void window.pen.hub.update({ orientation: hub().orientation === 'h' ? 'v' : 'h' });
  const minimize = () => void window.pen.hub.update({ minimized: true });
  const restore = () => void window.pen.hub.update({ minimized: false });
  const closeApp = () => void window.pen.win.close();
  const cycleBoard = () => {
    const next: Whiteboard =
      hub().whiteboard === 'off' ? 'white' : hub().whiteboard === 'white' ? 'black' : 'off';
    void window.pen.hub.update({ whiteboard: next });
  };
  const toggleTheme = () => {
    void window.pen.hub.update({ theme: hub().theme === 'dark' ? 'light' : 'dark' });
  };
  const setProfile = (p: ProfileId) => void window.pen.hub.update({ profile: p });
  const toggleAlwaysAsk = () =>
    void window.pen.hub.update({ alwaysAskSavePath: !hub().alwaysAskSavePath });
  const pickSaveDir = async () => {
    const dir = (await window.pen.settings.pickSaveDir()) as string | null;
    if (dir) void window.pen.hub.update({ saveDir: dir });
  };
  const toggleSettings = () => {
    const next = !hub().settingsOpen;
    if (next) refreshSide();
    void window.pen.hub.update({ settingsOpen: next });
  };
  const closeSettings = () => void window.pen.hub.update({ settingsOpen: false });

  // Status-panel actions. panelKind drives the rendered content;
  // hub.statusPanelOpen is the open/close flag main watches so it
  // can grow/shrink the toolbar window to fit the panel (in v-mode
  // the dock slot's width comes from main's resizeToolbar, not CSS).
  // A createEffect below keeps them in sync — without this mirror
  // the panel would render inside the 88px-wide v-mode bar and be
  // effectively invisible.
  const closePanel = () => {
    setPanelKind(null);
    setPanelError(null);
    setPanelHint(null);
  };
  const recheckPermission = async () => {
    // Use the deep probe — macOS's getMediaAccessStatus caches the
    // result per-process and a plain check() can keep reporting
    // 'denied' for the whole session even after the user toggled the
    // permission on in System Settings. The deep probe actually hits
    // desktopCapturer and forces a TCC refresh.
    setPanelHint('Checking…');
    const result = (await window.pen.permissions.deepCheck()) as {
      screen: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
      probeError: boolean;
    };
    if (result.screen === 'granted') {
      closePanel();
      return;
    }
    setPermStuck(result.probeError);
    setPanelHint(stuckHint(result.probeError));
  };
  const openScreenPrefs = () => void window.pen.permissions.open('screen');
  const relaunchApp = () => void window.pen.app.relaunch();
  const pickFolderFromError = async () => {
    const dir = (await window.pen.settings.pickSaveDir()) as string | null;
    if (dir) {
      void window.pen.hub.update({ saveDir: dir });
      closePanel();
    }
  };
  // Auto-recheck when the toolbar window regains focus — typical
  // path is user opens System Settings, toggles Lekhini on, comes
  // back. We only fire this while the permission panel is up so we
  // don't badger the user otherwise.
  const onWindowFocus = () => {
    if (panelKind() === 'permission') void recheckPermission();
  };

  // Mirror the side-panel state into a CSS-friendly attribute so the
  // existing layout rules (flex-direction switch in v-mode, etc.)
  // apply uniformly whether settings or a status panel is open.
  const sidePanelOpen = createMemo(() =>
    hub().settingsOpen || panelKind() !== null,
  );

  const showHint = (text: string) => setHint(text);
  const clearHint = () => setHint('');
  const isMac = createMemo(() => platform() === 'darwin');
  const isVert = createMemo(() => hub().orientation === 'v');
  const profileTools = createMemo(() => {
    const allowed = new Set(PROFILES[hub().profile].tools);
    return ALL_TOOLS.filter((t) => allowed.has(t.id));
  });
  // Hint line for the footer. Hover-hint takes priority; otherwise we
  // show the active tool's name so the footer is never empty in
  // either orientation. brandLine / vertHintLine retained for any
  // future use but the footer is the new home for hover text.
  const footerHintLine = (): string => {
    if (hint()) return hint();
    const active = TOOL_BY_ID[hub().activeTool];
    if (active) return active.label;
    return hub().drawMode ? 'Drawing' : 'Idle';
  };

  return (
    <div
      class="bar"
      data-orient={hub().orientation}
      data-min={hub().minimized ? 'true' : 'false'}
      data-platform={isMac() ? 'mac' : 'win'}
      data-theme={hub().theme}
      data-settings-open={sidePanelOpen() ? 'true' : 'false'}
      data-settings-side={settingsOnLeft() ? 'left' : 'right'}
    >
      <Show
        when={!hub().minimized}
        fallback={
          <div class="mini">
            {/* Click target is the inner span (no-drag region). The
                outer .mini is a thin drag border so the pill can
                still be moved without expanding. */}
            <button
              class="mini-logo"
              onClick={restore}
              title="Restore toolbar"
              aria-label="Restore toolbar"
            >{Logo()}</button>
          </div>
        }
      >
        <div class="bar-main" ref={barMainRef}>
          {/* ─── HORIZONTAL TITLE BAR ─── */}
          <Show when={!isVert()}>
            <div class="titlebar h-titlebar">
              <div class="tb-side tb-left">
                <Show when={isMac()}>
                  <div class="mac-traffic">
                    <button
                      class="mac-light close"
                      onClick={closeApp}
                      onMouseEnter={() => showHint('Quit')}
                      onMouseLeave={clearHint}
                    ><span>×</span></button>
                    <button
                      class="mac-light min"
                      onClick={minimize}
                      onMouseEnter={() => showHint('Minimize')}
                      onMouseLeave={clearHint}
                    ><span>−</span></button>
                  </div>
                </Show>
              </div>

              <div class="tb-center">
                <span class="logo big">{Logo()}</span>
              </div>

              <div class="tb-side tb-right">
                <button
                  class="winctl"
                  onClick={minimize}
                  onMouseEnter={() => showHint('Collapse toolbar')}
                  onMouseLeave={clearHint}
                  title="Collapse"
                >{Icons.collapse()}</button>
                <Show when={!isMac()}>
                  <button
                    class="winctl"
                    onClick={minimize}
                    onMouseEnter={() => showHint('Minimize')}
                    onMouseLeave={clearHint}
                  >{Icons.minus()}</button>
                  <button
                    class="winctl danger"
                    onClick={closeApp}
                    onMouseEnter={() => showHint('Quit')}
                    onMouseLeave={clearHint}
                  >{Icons.close()}</button>
                </Show>
              </div>
            </div>
          </Show>

          {/* ─── VERTICAL TOP STACK ─── */}
          <Show when={isVert()}>
            <div class="v-controls">
              <Show when={isMac()}>
                <div class="mac-traffic v-traffic">
                  <button
                    class="mac-light close"
                    onClick={closeApp}
                    onMouseEnter={() => showHint('Quit')}
                    onMouseLeave={clearHint}
                  ><span>×</span></button>
                  <button
                    class="mac-light min"
                    onClick={minimize}
                    onMouseEnter={() => showHint('Minimize')}
                    onMouseLeave={clearHint}
                  ><span>−</span></button>
                </div>
              </Show>
              <Show when={!isMac()}>
                <div class="v-winctls">
                  <button
                    class="winctl"
                    onClick={minimize}
                    onMouseEnter={() => showHint('Minimize')}
                    onMouseLeave={clearHint}
                  >{Icons.minus()}</button>
                  <button
                    class="winctl danger"
                    onClick={closeApp}
                    onMouseEnter={() => showHint('Quit')}
                    onMouseLeave={clearHint}
                  >{Icons.close()}</button>
                </div>
              </Show>
              <button
                class="winctl v-collapse"
                onClick={minimize}
                onMouseEnter={() => showHint('Collapse toolbar')}
                onMouseLeave={clearHint}
                title="Collapse"
              >{Icons.collapse()}</button>
            </div>
            <div class="v-brand">
              <span class="logo big">{Logo()}</span>
            </div>
          </Show>

          {/* ─── SCROLLABLE TOOLS + ACTIONS ─── */}
          <div class="scroll-area" ref={scrollRef}>
            <div class="tools-zone">
              <For each={profileTools()}>
                {(t) => (
                  <button
                    class={`tool-btn ${hub().activeTool === t.id ? 'active' : ''}`}
                    onClick={() => setTool(t.id)}
                    onMouseEnter={() => showHint(`${t.label} · ${t.hint}`)}
                    onMouseLeave={clearHint}
                  >{t.icon()}</button>
                )}
              </For>
            </div>

            <div class="zone-sep" />

            <div class="actions-zone">
              <button
                class="action-btn"
                onClick={() => window.pen.relay.undo()}
                onMouseEnter={() => showHint('Undo · ⌘Z')}
                onMouseLeave={clearHint}
              >{Icons.undo()}</button>
              <button
                class="action-btn"
                onClick={() => window.pen.relay.redo()}
                onMouseEnter={() => showHint('Redo · ⌘⇧Z')}
                onMouseLeave={clearHint}
              >{Icons.redo()}</button>
              <button
                class="action-btn"
                onClick={() => window.pen.relay.clear()}
                onMouseEnter={() => showHint('Clear · ⌘⇧C')}
                onMouseLeave={clearHint}
              >{Icons.clear()}</button>
              <button
                class="action-btn"
                onClick={() => window.pen.relay.screenshot()}
                onMouseEnter={() => showHint('Screenshot · ⌘⇧S')}
                onMouseLeave={clearHint}
              >{Icons.camera()}</button>
              <button
                class={`action-btn ${hub().whiteboard !== 'off' ? 'tinted' : ''}`}
                onClick={cycleBoard}
                onMouseEnter={() =>
                  showHint(
                    `Board: ${hub().whiteboard === 'off' ? 'Off' : hub().whiteboard === 'white' ? 'White' : 'Black'}`,
                  )
                }
                onMouseLeave={clearHint}
              >{Icons.whiteboard()}</button>
              <button
                class={`action-btn thickness-trigger ${hub().thicknessFlyoutOpen ? 'tinted' : ''}`}
                onClick={toggleThickness}
                disabled={!isFlyoutTool(hub().activeTool)}
                onMouseEnter={() =>
                  showHint(
                    isFlyoutTool(hub().activeTool)
                      ? `Thickness · ${hub().settings.width}px`
                      : 'Thickness — pick pencil/pen/eraser/highlighter first',
                  )
                }
                onMouseLeave={clearHint}
                title="Thickness"
                aria-label="Thickness"
              >{Icons.thickness()}</button>
            </div>

            {/* Horizontal: color grid sits right after the thickness
                icon, pushed to the right via margin-left:auto with
                breathing room from the toolbar's right edge. */}
            <Show when={!isVert()}>
              <div class="color-grid">
                <For each={COLOR_PRESETS}>
                  {(c) => (
                    <div
                      class={`swatch ${
                        hub().settings.color.toLowerCase() === c.toLowerCase() ? 'active' : ''
                      }`}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                      onMouseEnter={() => showHint(c.toUpperCase())}
                      onMouseLeave={clearHint}
                    />
                  )}
                </For>
                <label
                  class="hex-pick"
                  onMouseEnter={() => showHint('Custom color')}
                  onMouseLeave={clearHint}
                >
                  <input
                    type="color"
                    value={hub().settings.color}
                    onInput={(e) => setColor((e.currentTarget as HTMLInputElement).value)}
                  />
                  <span class="hex-glyph">+</span>
                </label>
              </div>
            </Show>

          </div>

          {/* ── THICKNESS POPUP ──
               Rendered as a sibling between scroll-area and pinned so
               it gets its own row instead of competing for inline
               space with the color grid (h-mode) or the actions row
               (v-mode). The bar window auto-grows to accommodate. */}
          <Show when={hub().thicknessFlyoutOpen && isFlyoutTool(hub().activeTool)}>
            {(() => {
              const tool = hub().activeTool as FlyoutTool;
              const presets = THICKNESS_PRESETS[tool].slice(0, 4);
              return (
                <div class="thickness-popup" data-tool={tool}>
                  <For each={presets}>
                    {(w) => (
                      <button
                        class={`thickness-chip ${hub().settings.width === w ? 'active' : ''}`}
                        onClick={() => pickThickness(w)}
                        onMouseEnter={() => showHint(`${w}px`)}
                        onMouseLeave={clearHint}
                        title={`${w}px`}
                        aria-label={`${w} pixels`}
                      >
                        <span
                          class="thickness-chip-dot"
                          style={{
                            width: `${Math.min(w, isVert() ? 14 : 22)}px`,
                            height: `${Math.min(w, isVert() ? 14 : 22)}px`,
                            background:
                              tool === 'eraser' || tool === 'pencil'
                                ? 'var(--text)'
                                : hub().settings.color,
                            opacity: tool === 'highlighter' ? 0.55 : 1,
                          }}
                        />
                      </button>
                    )}
                  </For>
                </div>
              );
            })()}
          </Show>

          {/* ─── PINNED BOTTOM ─── swatches live here in v-mode only.
               In h-mode pinned is empty and hidden via :empty so it
               doesn't add a stray bottom padding band. */}
          <div class="pinned">
            <Show when={isVert()}>
              <div class="swatches">
                <For each={COLOR_PRESETS}>
                  {(c) => (
                    <div
                      class={`swatch ${
                        hub().settings.color.toLowerCase() === c.toLowerCase() ? 'active' : ''
                      }`}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                      onMouseEnter={() => showHint(c.toUpperCase())}
                      onMouseLeave={clearHint}
                    />
                  )}
                </For>
                <label
                  class="hex-pick"
                  onMouseEnter={() => showHint('Custom color')}
                  onMouseLeave={clearHint}
                >
                  <input
                    type="color"
                    value={hub().settings.color}
                    onInput={(e) => setColor((e.currentTarget as HTMLInputElement).value)}
                  />
                  <span class="hex-glyph">+</span>
                </label>
              </div>
            </Show>
          </div>

          {/* ─── FOOTER ─── hover-hint on the left, plus the
               rarely-touched status-dot + settings on the right. Lives
               at the bottom of bar-main so it doesn't take attention
               away from the tools. The hint area is also where the
               'Saved · …/lekhini-…png' reveal link surfaces. */}
          <div class="bar-footer">
            <div
              class={`bar-footer-hint ${hint() ? 'has-hint' : ''} ${revealPath() ? 'is-reveal' : ''}`}
              onClick={() => {
                const p = revealPath();
                if (p) void window.pen.shell.openPath(p);
              }}
              title={revealPath() ? 'Click to reveal in folder' : footerHintLine()}
            >
              {footerHintLine()}
            </div>
            <div class="bar-footer-controls">
              <button
                class={`status-dot-btn ${hub().drawMode ? 'on' : ''}`}
                onClick={toggleDraw}
                onMouseEnter={() =>
                  showHint(hub().drawMode ? 'Drawing — click to pause' : 'Idle — click to draw')
                }
                onMouseLeave={clearHint}
                title={hub().drawMode ? 'Drawing active' : 'Click to start drawing'}
                aria-label={hub().drawMode ? 'Drawing active' : 'Drawing paused'}
              >
                <span class="status-dot-pulse" />
              </button>
              <button
                class={`winctl footer-settings ${hub().settingsOpen ? 'tinted' : ''}`}
                onClick={toggleSettings}
                onMouseEnter={() => showHint('Settings')}
                onMouseLeave={clearHint}
                title="Settings"
              >
                {Icons.gear()}
              </button>
            </div>
          </div>
        </div>

        {/* ─── SETTINGS DROPDOWN ─── */}
        <Show when={hub().settingsOpen}>
          <div class="settings-panel">
            <div class="settings-header">
              <span class="settings-title">Settings</span>
              <button
                class="winctl"
                onClick={closeSettings}
                onMouseEnter={() => showHint('Close settings')}
                onMouseLeave={clearHint}
                title="Close"
              >{Icons.close()}</button>
            </div>

            <div class="settings-section">
              <div class="settings-section-label">Profile</div>
              <div class="profile-list">
                <For each={PROFILE_ORDER}>
                  {(pid) => {
                    const p = PROFILES[pid];
                    return (
                      <button
                        class={`profile-card ${hub().profile === pid ? 'active' : ''}`}
                        onClick={() => setProfile(pid)}
                      >
                        <div class="profile-card-row">
                          <span class="profile-card-name">{p.label}</span>
                          <Show when={hub().profile === pid}>
                            <span class="profile-card-tick">{Icons.check()}</span>
                          </Show>
                        </div>
                        <span class="profile-card-desc">{p.description}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>

            <div class="settings-section">
              <div class="settings-section-label">Appearance</div>
              <div class="settings-row">
                <span class="settings-row-label">Theme</span>
                <button class="settings-toggle" onClick={toggleTheme}>
                  <span class="settings-toggle-icon">
                    {hub().theme === 'dark' ? Icons.moon() : Icons.sun()}
                  </span>
                  <span>{hub().theme === 'dark' ? 'Dark' : 'Light'}</span>
                </button>
              </div>
              <div class="settings-row">
                <span class="settings-row-label">Layout</span>
                <button class="settings-toggle" onClick={toggleOrient}>
                  <span class="settings-toggle-icon">{Icons.orient()}</span>
                  <span>{hub().orientation === 'h' ? 'Horizontal' : 'Vertical'}</span>
                </button>
              </div>
            </div>

            <div class="settings-section">
              <div class="settings-section-label">File save</div>
              <div class="settings-row">
                <span class="settings-row-label">Always ask where to save</span>
                <button
                  class={`settings-toggle ${hub().alwaysAskSavePath ? 'on' : ''}`}
                  onClick={toggleAlwaysAsk}
                >
                  <span>{hub().alwaysAskSavePath ? 'On' : 'Off'}</span>
                </button>
              </div>
              <div class="settings-row settings-row-stack">
                <span class="settings-row-label">Save folder</span>
                <button
                  class="settings-toggle settings-toggle-wide"
                  onClick={() => void pickSaveDir()}
                  title={hub().saveDir ?? 'Not chosen yet'}
                >
                  <span class="settings-path">
                    {hub().saveDir ? shortenPath(hub().saveDir!, 28) : 'Choose…'}
                  </span>
                </button>
              </div>
            </div>

            <div class="settings-section">
              <div class="settings-section-label">About</div>
              <div class="about-card">
                <div class="about-header">
                  <span class="about-logo">{Logo()}</span>
                  <div class="about-title-block">
                    <span class="about-name">{appInfo().name}</span>
                    <span class="about-version">v{appInfo().version}</span>
                  </div>
                </div>
                <div class="about-line about-license">
                  <span class="about-badge">Open Source</span>
                  <span class="about-license-text">MIT License</span>
                </div>
                <div class="about-tagline">Made in India · 2026</div>
              </div>
            </div>
          </div>
        </Show>

        {/* ─── STATUS PANEL (permission / save error) ──────────────
             Reuses the .settings-panel layout slot so it docks like
             the Settings panel and grows the toolbar window the same
             way. Settings has render priority — we only show this
             when the settings panel is closed. */}
        <Show when={panelKind() !== null && !hub().settingsOpen}>
          <div class="settings-panel status-panel" data-kind={panelKind()}>
            <div class="settings-header">
              <span class="settings-title">
                {panelKind() === 'permission' ? 'Screen Recording' : "Couldn't save screenshot"}
              </span>
              <button
                class="winctl"
                onClick={closePanel}
                onMouseEnter={() => showHint('Close')}
                onMouseLeave={clearHint}
                title="Close"
              >{Icons.close()}</button>
            </div>

            <Show when={panelKind() === 'permission'}>
              <div class="settings-section">
                <div class="status-icon-row">
                  <span class="status-icon">{Icons.camera()}</span>
                  <div class="status-body">
                    Lekhini needs Screen Recording permission to capture annotated
                    screenshots.{' '}
                    <Show when={isMac()}>
                      macOS controls this — toggle Lekhini on under Privacy &amp;
                      Security → Screen Recording, then return here. Lekhini
                      retries automatically when you come back.
                    </Show>
                    <Show when={!isMac()}>
                      You denied the system prompt last time. Try the screenshot
                      button again to be asked once more.
                    </Show>
                  </div>
                </div>
                <Show when={panelHint()}>
                  <div class={`status-hint ${permStuck() ? 'is-stuck' : ''}`}>
                    {panelHint()}
                  </div>
                </Show>
                <div class="status-actions">
                  <Show when={isMac() && !permStuck()}>
                    <button
                      class="settings-toggle status-btn-primary"
                      onClick={openScreenPrefs}
                    >
                      Open System Settings
                    </button>
                  </Show>
                  <Show when={isMac() && permStuck()}>
                    <button
                      class="settings-toggle status-btn-primary"
                      onClick={relaunchApp}
                      title="macOS can't update the permission for a running process — restart picks it up"
                    >
                      Relaunch Lekhini
                    </button>
                  </Show>
                  <button
                    class="settings-toggle"
                    onClick={() => void recheckPermission()}
                  >
                    Recheck
                  </button>
                  <Show when={isMac() && !permStuck()}>
                    <button
                      class="settings-toggle status-btn-relaunch"
                      onClick={relaunchApp}
                      title="Quit and reopen Lekhini — sometimes needed for macOS to pick up newly granted permissions"
                    >
                      Relaunch
                    </button>
                  </Show>
                  <Show when={isMac() && permStuck()}>
                    <button class="settings-toggle" onClick={openScreenPrefs}>
                      Open System Settings
                    </button>
                  </Show>
                </div>
                <Show when={isMac() && !appInfo().packaged}>
                  <div class="status-footnote">
                    Dev mode — TCC quirks are normal here. The packaged
                    Lekhini build doesn't have this caching issue.
                  </div>
                </Show>
              </div>
            </Show>

            <Show when={panelKind() === 'error'}>
              <div class="settings-section">
                <div class="status-icon-row">
                  <span class="status-icon status-icon-error">{Icons.clear()}</span>
                  <div class="status-body">{panelError() ?? 'Unknown error.'}</div>
                </div>
                <div class="status-actions">
                  <button
                    class="settings-toggle status-btn-primary"
                    onClick={() => void pickFolderFromError()}
                  >
                    Pick new folder
                  </button>
                  <button class="settings-toggle" onClick={closePanel}>
                    Dismiss
                  </button>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}
