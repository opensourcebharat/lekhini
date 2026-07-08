import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onMount,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';
import { PINNED_COLORS } from '../../shared/constants';
import { PROFILES, PROFILE_ORDER, resolveAiPrompt } from '../../shared/profiles';
import { groupOf, groupToolsForProfile, GROUP_IDS } from '../../shared/toolGroups';
import type {
  AiStatus,
  ChatSessionPayload,
  ConnectionTestResult,
  FlyoutId,
  GroupId,
  LocalModelInfo,
  OllamaPullProgress,
  OllamaServiceStatus,
  Orientation,
  ProfileId,
  ProviderId,
  Theme,
  ToolId,
  ToolSettings,
  UpdateStatus,
  Whiteboard,
} from '../../shared/types';
import { Icons, Logo } from './icons';
import { ChatPanel } from './ChatPanel';
import { ToolButton } from './ToolButton';
import { GroupButton } from './GroupButton';
import { FlyoutCard } from './FlyoutCard';
import { ColorFlyout } from './ColorFlyout';

// The cloud providers (kept as an opt-in fallback). Local (Ollama)
// has its own settings section, so these mirror maps are cloud-only.
type CloudProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'sarvam';

const PROVIDER_LABELS: Record<CloudProviderId, string> = {
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI ChatGPT',
  gemini: 'Google Gemini',
  deepseek: 'DeepSeek',
  sarvam: 'Sarvam AI',
};

const PROVIDER_KEY_URLS: Record<CloudProviderId, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/app/apikey',
  deepseek: 'https://platform.deepseek.com/api_keys',
  sarvam: 'https://dashboard.sarvam.ai',
};

interface ModelOption {
  id: string;
  label: string;
}

// Kept in sync with src/main/ai/registry.ts. A static mirror is fine
// — the list rotates with SDK releases, not user input.
const MODELS_BY_PROVIDER: Record<CloudProviderId, ModelOption[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (recommended)' },
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast / cheap)' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o (recommended)' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini (fast / cheap)' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (recommended)' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ],
  // Text-only — see registry.ts. No vision; routes image snips to text.
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek V3 (recommended)' },
    { id: 'deepseek-reasoner', label: 'DeepSeek R1 (reasoner)' },
  ],
  // Vision-capable via Sarvam's own OCR (image → text → solve).
  sarvam: [
    { id: 'sarvam-m', label: 'Sarvam-M 24B (recommended)' },
    { id: 'sarvam-30b', label: 'Sarvam-30B' },
    { id: 'sarvam-105b', label: 'Sarvam-105B (strongest)' },
  ],
};

const DEFAULT_MODEL: Record<CloudProviderId, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat',
  sarvam: 'sarvam-m',
};

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
  flyout: FlyoutId | null;
  groupLastTool: Partial<Record<GroupId, ToolId>>;
  perToolWidth: { pencil: number; pen: number; eraser: number; highlighter: number };
  saveDir: string | null;
  alwaysAskSavePath: boolean;
  statusPanelOpen: boolean;
  chatOpen: boolean;
  aiActiveProvider: ProviderId | null;
  aiActiveModel: string | null;
  aiProfilePrompts: Partial<Record<ProfileId, string>>;
  aiLocalEnabled: boolean;
  aiInstalledModels: string[];
  aiLocalModel: string | null;
  aiLocalVisionModel: string | null;
  aiProfileModels: Partial<Record<ProfileId, { text?: string; vision?: string }>>;
  autocorrectTyped: boolean;
  autocorrectDrawn: boolean;
  defaultTextFont: string;
  aiOnboarded: boolean;
  autoUpdate: boolean;
}

// Curated, cross-platform-safe font choices for the default-text-font
// picker. Values are CSS font-family stacks stamped onto TextShapes.
const TEXT_FONTS: { label: string; value: string }[] = [
  { label: 'System', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Sans', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Serif', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Mono', value: "Menlo, Consolas, 'Courier New', monospace" },
  { label: 'Rounded', value: "'SF Pro Rounded', 'Segoe UI', system-ui, sans-serif" },
];

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

// One rendered slot in the tools column: either a plain tool button or
// a group button (draw / shapes) carrying its profile-filtered members.
type ToolSlot =
  | { kind: 'tool'; tool: ToolId }
  | { kind: 'group'; group: GroupId; tools: ToolId[] };

// Canonical top-level order — groups fold their members in place.
const SLOT_ORDER: (ToolId | GroupId)[] = ['draw', 'eraser', 'hand', 'shapes', 'text', 'snip'];
const GROUP_LABELS: Record<GroupId, string> = { draw: 'Drawing tools', shapes: 'Shapes' };

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
  // in the renderer; fall back to the common macOS / Linux / Windows
  // prefixes.
  const home =
    /^\/Users\/[^/]+/.exec(s)?.[0] ??
    /^\/home\/[^/]+/.exec(s)?.[0] ??
    /^[A-Za-z]:[\\/]Users[\\/][^\\/]+/.exec(s)?.[0];
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
    flyout: null,
    groupLastTool: {},
    perToolWidth: { pencil: 3, pen: 4, eraser: 20, highlighter: 18 },
    saveDir: null,
    alwaysAskSavePath: false,
    statusPanelOpen: false,
    chatOpen: false,
    aiActiveProvider: null,
    aiActiveModel: null,
    aiProfilePrompts: {},
    aiLocalEnabled: false,
    aiInstalledModels: [],
    aiLocalModel: null,
    aiLocalVisionModel: null,
    aiProfileModels: {},
    autocorrectTyped: false,
    autocorrectDrawn: false,
    defaultTextFont: 'system-ui, -apple-system, sans-serif',
    aiOnboarded: false,
    autoUpdate: true,
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
  // Auto-update lifecycle, pushed from main via 'updater:status'.
  const [updateStatus, setUpdateStatus] = createSignal<UpdateStatus | null>(null);
  let scrollRef: HTMLDivElement | undefined;
  let barMainRef: HTMLDivElement | undefined;

  // ── AI Settings section state ───────────────────────────────────
  // aiStatus tells us which providers have a key (renderer never sees
  // the key itself). Selected dropdown values + keyInput are local
  // working state until the user clicks Save.
  const [aiStatus, setAiStatus] = createSignal<AiStatus[]>([]);
  const [aiSelectedProvider, setAiSelectedProvider] = createSignal<CloudProviderId>('anthropic');
  const [aiSelectedModel, setAiSelectedModel] = createSignal<string>(
    DEFAULT_MODEL.anthropic,
  );
  const [aiKeyInput, setAiKeyInput] = createSignal('');
  const [aiTestResult, setAiTestResult] = createSignal<ConnectionTestResult | null>(null);
  const [aiBusy, setAiBusy] = createSignal<'saving' | 'testing' | null>(null);
  // The current chat session, captured here (in the always-mounted
  // toolbar) rather than inside ChatPanel — ChatPanel only mounts when
  // chatOpen flips true, and main broadcasts chat:session at that same
  // instant, so a listener inside the panel misses the first session.
  // We subscribe in onMount below and hand it down as a prop.
  const [chatSession, setChatSession] = createSignal<ChatSessionPayload | null>(null);

  const refreshAiStatus = async (): Promise<void> => {
    const status = await window.pen.ai.getStatus();
    setAiStatus(status);
  };

  const isProviderConfigured = (id: ProviderId): boolean =>
    aiStatus().find((s) => s.provider === id)?.configured ?? false;

  // ── Local (Ollama) AI state ─────────────────────────────────────
  const [ollamaStatus, setOllamaStatus] = createSignal<OllamaServiceStatus | null>(null);
  const [localModels, setLocalModels] = createSignal<LocalModelInfo[]>([]);
  // Per-tag pull progress, keyed by model tag. Present = pull in flight.
  const [pulls, setPulls] = createSignal<Record<string, OllamaPullProgress>>({});

  const refreshLocal = async (): Promise<void> => {
    const st = await window.pen.ollama.status();
    setOllamaStatus(st);
    setLocalModels(st.running ? await window.pen.ollama.listModels() : []);
  };

  // ── Learning (RAG) state ────────────────────────────────────────
  const [ragStats, setRagStats] = createSignal<Record<ProfileId, number>>({
    general: 0,
    teacher: 0,
    trader: 0,
  });
  const refreshRag = async (): Promise<void> => {
    setRagStats(await window.pen.rag.stats());
  };
  const resetLearning = async (profile: ProfileId): Promise<void> => {
    await window.pen.rag.resetProfile(profile);
    await refreshRag();
  };

  // ── First-run setup wizard ──────────────────────────────────────
  const defaultModels = (): LocalModelInfo[] => localModels().filter((m) => m.defaultPull);
  const defaultModelsTotalGB = (): string =>
    (defaultModels().reduce((sum, m) => sum + m.approxBytes, 0) / 1e9).toFixed(1);
  const defaultModelsReady = (): boolean => {
    const d = defaultModels();
    return d.length > 0 && d.every((m) => m.installed);
  };
  type WizardStep = 'checking' | 'install' | 'start' | 'download' | 'ready';
  const wizardStep = (): WizardStep => {
    const st = ollamaStatus();
    if (!st) return 'checking';
    if (!st.installed) return 'install';
    if (!st.running) return 'start';
    return defaultModelsReady() ? 'ready' : 'download';
  };
  const downloadRecommended = async (): Promise<void> => {
    for (const m of defaultModels()) {
      if (!m.installed && !pulls()[m.tag]) await pullModel(m.tag);
    }
  };
  const finishOnboarding = (): void =>
    void window.pen.hub.update({
      aiLocalEnabled: true,
      aiOnboarded: true,
      settingsOpen: false,
    });
  const skipOnboarding = (): void => void window.pen.hub.update({ aiOnboarded: true });

  const startOllama = async (): Promise<void> => {
    setOllamaStatus(await window.pen.ollama.start());
    await refreshLocal();
  };

  const pullModel = async (tag: string): Promise<void> => {
    setPulls((p) => ({ ...p, [tag]: { model: tag, status: 'starting' } }));
    await window.pen.ollama.pull(tag);
    setPulls((p) => {
      const next = { ...p };
      delete next[tag];
      return next;
    });
    await refreshLocal();
  };

  const cancelPull = (tag: string): void => {
    void window.pen.ollama.cancelPull(tag);
  };

  const deleteModel = async (tag: string): Promise<void> => {
    await window.pen.ollama.deleteModel(tag);
    await refreshLocal();
  };

  const pullPct = (p: OllamaPullProgress): number | null => {
    if (!p.total || !p.completed) return null;
    return Math.min(100, Math.round((p.completed / p.total) * 100));
  };

  const toggleLocalEnabled = (): void => {
    void window.pen.hub.update({ aiLocalEnabled: !hub().aiLocalEnabled });
    if (!ollamaStatus()?.running) void startOllama();
  };

  const toggleAutocorrectTyped = (): void =>
    void window.pen.hub.update({ autocorrectTyped: !hub().autocorrectTyped });
  const toggleAutocorrectDrawn = (): void =>
    void window.pen.hub.update({ autocorrectDrawn: !hub().autocorrectDrawn });
  const setDefaultFont = (value: string): void =>
    void window.pen.hub.update({ defaultTextFont: value });

  // Per-profile model pickers (only installed models of each kind).
  const installedOfKind = (kind: 'text' | 'vision'): LocalModelInfo[] =>
    localModels().filter((m) => m.kind === kind && m.installed);
  const setProfileModel = (profile: ProfileId, kind: 'text' | 'vision', tag: string): void =>
    void window.pen.hub.update({ aiProfileModels: { [profile]: { [kind]: tag } } });

  // Whenever the selected provider changes, snap the model dropdown
  // to that provider's default (unless it's already a valid model
  // for the provider — e.g. when the hub broadcasts an existing pair).
  createEffect(() => {
    const p = aiSelectedProvider();
    const valid = MODELS_BY_PROVIDER[p].some((m) => m.id === aiSelectedModel());
    if (!valid) setAiSelectedModel(DEFAULT_MODEL[p]);
  });

  // Sync the selected dropdowns to the persisted active provider
  // once the hub state arrives.
  createEffect(() => {
    const ap = hub().aiActiveProvider;
    const am = hub().aiActiveModel;
    // The cloud dropdown only tracks cloud providers; local has its
    // own section, so ignore an 'ollama' active provider here.
    if (ap && ap !== 'ollama') setAiSelectedProvider(ap);
    if (am) setAiSelectedModel(am);
  });

  onMount(() => {
    void window.pen.hub.get().then((state) => {
      const s = state as HubSnapshot;
      setHub(s);
      if (s.settingsOpen) refreshSide();
      // First launch → open Settings so the setup wizard is visible.
      if (!s.aiOnboarded) void window.pen.hub.update({ settingsOpen: true });
    });
    void window.pen.win.platform().then(setPlatform);
    void window.pen.app.info().then(setAppInfo);
    void window.pen.updater.get().then(setUpdateStatus);
    const offUpdater = window.pen.updater.onStatus(setUpdateStatus);
    onCleanup(offUpdater);
    void refreshAiStatus();
    void refreshLocal();
    void refreshRag();
    // Live pull progress for the local model installer.
    const offPull = window.pen.ollama.onPullProgress((p) => {
      setPulls((prev) => {
        if (p.done) {
          const next = { ...prev };
          delete next[p.model];
          return next;
        }
        return { ...prev, [p.model]: p };
      });
    });
    onCleanup(offPull);
    // Capture chat sessions for the ChatPanel. Subscribing here (always
    // mounted) instead of inside the panel is what fixes the "first Ask
    // AI does nothing" bug — see chatSession's declaration.
    const offChat = window.pen.chat.onSession(setChatSession);
    onCleanup(offChat);
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

    // Close any open flyout on Esc, click-outside, or window blur.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && hub().flyout !== null) closeFlyout();
    };
    const onDocDown = (e: PointerEvent) => {
      if (hub().flyout === null) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // Keep the card open when the press lands inside it or on its
      // anchor (group button / color dot) — those toggle it themselves.
      if (t.closest('.flyout-card, .group-btn, .color-dot')) return;
      closeFlyout();
    };
    const onWinBlur = () => {
      if (hub().flyout !== null) closeFlyout();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDocDown, true);
    window.addEventListener('blur', onWinBlur);

    onCleanup(() => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDocDown, true);
      window.removeEventListener('blur', onWinBlur);
    });
  });

  // Adapt the toolbar window height to its content. bar-main is
  // content-sized, so we sum each child's natural height (using
  // scrollHeight for scroll-area). When the settings panel is open we
  // include it too — stacked vertically in h-mode (column flex bar),
  // side-by-side in v-mode (row flex bar, so we take the taller side).
  let lastReported = 0;
  let lastReportedW = 0;
  const reportContentSize = () => {
    if (!barMainRef) return;
    const s = hub();
    if (s.minimized) return;

    // Natural content size of bar-main. The scroll-area's client box
    // tracks whatever the window currently allots, so use scrollWidth /
    // scrollHeight for it and offset sizes for everything else — both
    // for .bar-row's children (strip, brand, scroll-area, bar-end) and
    // for bar-main's other children (the save toast).
    const row = barMainRef.querySelector('.bar-row') as HTMLElement | null;
    let barMainHeight = 0;
    let barMainWidth = 0;
    if (row) {
      if (s.orientation === 'v') {
        for (const child of Array.from(row.children)) {
          const el = child as HTMLElement;
          barMainHeight += el.classList.contains('scroll-area')
            ? el.scrollHeight
            : el.offsetHeight;
        }
      } else {
        barMainHeight = row.offsetHeight;
        for (const child of Array.from(row.children)) {
          const el = child as HTMLElement;
          barMainWidth += el.classList.contains('scroll-area')
            ? el.scrollWidth
            : el.offsetWidth;
        }
      }
    }
    for (const child of Array.from(barMainRef.children)) {
      const el = child as HTMLElement;
      if (el !== row) barMainHeight += el.offsetHeight;
    }

    let target = barMainHeight;
    // Settings, status, and chat panels all render with class
    // .settings-panel; whichever is open occupies the dock slot.
    if (s.settingsOpen || s.statusPanelOpen || s.chatOpen) {
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
    // h-mode: an open flyout card floats below the bar — include it.
    if (s.orientation === 'h' && s.flyout !== null) {
      const card = barMainRef.parentElement?.querySelector(
        '.flyout-card',
      ) as HTMLElement | null;
      if (card) target = Math.max(target, barMainHeight + 8 + card.offsetHeight + 8);
    }
    // 2px for the bar-main border.
    target += 2;
    if (target !== lastReported && target >= 60) {
      lastReported = target;
      void window.pen.win.setContentSize({ axis: 'v', size: target });
    }
    // h-mode: the bar also hugs its content WIDTH (it varies by
    // profile now that tools are grouped). Computed from the row's
    // children above so a shrunken scroll-area doesn't lock the
    // measurement to the current window width.
    if (s.orientation === 'h' && barMainWidth > 0) {
      const w = barMainWidth + 2;
      if (w !== lastReportedW && w >= 60) {
        lastReportedW = w;
        void window.pen.win.setContentSize({ axis: 'h', size: w });
      }
    }
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
    void s.chatOpen;
    void s.flyout;
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
  const closeFlyout = () => void window.pen.hub.update({ flyout: null });
  // Anchor elements for each flyout, captured at open time so the card
  // can position itself next to the button that spawned it.
  const anchorEls: Partial<Record<FlyoutId, HTMLElement>> = {};
  const [flyoutAnchor, setFlyoutAnchor] = createSignal<DOMRect | null>(null);
  const openFlyout = (id: FlyoutId) => {
    const el = anchorEls[id];
    setFlyoutAnchor(el ? el.getBoundingClientRect() : null);
    refreshSide();
    void window.pen.hub.update({ flyout: id });
  };
  const toggleFlyout = (id: FlyoutId) => {
    if (hub().flyout === id) closeFlyout();
    else openFlyout(id);
  };
  const setTool = (id: ToolId) => {
    const s = hub();
    if (s.activeTool === id) {
      // Re-clicking the active tool toggles drawMode — a fast way back
      // to idle without hunting for the eye button.
      void window.pen.hub.update({ drawMode: !s.drawMode, flyout: null });
    } else {
      // hub.patch closes any open tool-group flyout on a tool change.
      void window.pen.hub.update({ activeTool: id, drawMode: true });
    }
  };
  const setColor = (c: string) => void window.pen.hub.update({ settings: { color: c } });
  const pickThickness = (n: number) =>
    void window.pen.hub.update({ settings: { width: n } });
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

  // ── Auto-update actions ─────────────────────────────────────────
  const checkForUpdates = (): void => void window.pen.updater.check();
  const installUpdate = (): void => void window.pen.updater.install();
  const openReleases = (): void => void window.pen.updater.openReleases();
  const toggleAutoUpdate = (): void =>
    void window.pen.hub.update({ autoUpdate: !hub().autoUpdate });
  // One-line, human-readable summary of the current update state.
  const updateLine = (): string => {
    const u = updateStatus();
    if (!u) return '';
    switch (u.state) {
      case 'checking':
        return 'Checking for updates…';
      case 'available':
        return `Update available: v${u.version}`;
      case 'downloading':
        return `Downloading v${u.version ?? ''}… ${u.percent ?? 0}%`;
      case 'downloaded':
        return `v${u.version} ready — restart to update`;
      case 'none':
        return "You're on the latest version";
      case 'unsupported':
        return 'Automatic updates unavailable on this build';
      case 'error':
        return `Update check failed${u.message ? `: ${u.message}` : ''}`;
      default:
        return '';
    }
  };
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

  // ── AI action handlers ─────────────────────────────────────────
  const saveAiKey = async (): Promise<void> => {
    const key = aiKeyInput().trim();
    if (key.length === 0) return;
    setAiBusy('saving');
    try {
      await window.pen.ai.setKey(aiSelectedProvider(), key);
      await refreshAiStatus();
      setAiKeyInput('');
      // Snap the active provider/model to what was just configured
      // so the Ask AI button knows what to use.
      void window.pen.hub.update({
        aiActiveProvider: aiSelectedProvider(),
        aiActiveModel: aiSelectedModel(),
      });
      setAiTestResult({ ok: true, message: 'Key saved' });
    } finally {
      setAiBusy(null);
    }
  };
  const deleteAiKey = async (): Promise<void> => {
    await window.pen.ai.deleteKey(aiSelectedProvider());
    await refreshAiStatus();
    setAiTestResult(null);
    // If we just deleted the active provider's key, clear it from
    // hub so the Ask AI button hides.
    if (hub().aiActiveProvider === aiSelectedProvider()) {
      void window.pen.hub.update({
        aiActiveProvider: null,
        aiActiveModel: null,
      });
    }
  };
  const testAiConnection = async (): Promise<void> => {
    setAiBusy('testing');
    setAiTestResult(null);
    try {
      const result = await window.pen.ai.testConnection(
        aiSelectedProvider(),
        aiSelectedModel(),
      );
      setAiTestResult(result);
    } finally {
      setAiBusy(null);
    }
  };
  const setProfilePrompt = (profile: ProfileId, text: string): void => {
    void window.pen.hub.update({
      aiProfilePrompts: { [profile]: text },
    });
  };
  const resetProfilePrompt = (profile: ProfileId): void => {
    // Empty-string override is treated as "no override" by hub.patch,
    // so the default from PROFILES kicks back in.
    void window.pen.hub.update({
      aiProfilePrompts: { [profile]: '' },
    });
  };
  // Active model picker: whenever the user changes the model dropdown
  // for the ALREADY-CONFIGURED active provider, persist that choice.
  const onModelChange = (model: string): void => {
    setAiSelectedModel(model);
    if (
      hub().aiActiveProvider === aiSelectedProvider() &&
      model !== hub().aiActiveModel
    ) {
      void window.pen.hub.update({ aiActiveModel: model });
    }
  };
  const closeChat = (): void => {
    void window.pen.hub.update({ chatOpen: false });
  };

  // Mirror the side-panel state into a CSS-friendly attribute so the
  // existing layout rules (flex-direction switch in v-mode, etc.)
  // apply uniformly whether settings or a status panel is open.
  const sidePanelOpen = createMemo(() =>
    hub().settingsOpen || panelKind() !== null || hub().chatOpen || hub().flyout !== null,
  );

  // Any AI path usable: a cloud provider configured, OR Local AI on with
  // at least one model installed. Gates every AI entry point so nothing
  // AI-driven is offered until the user has configured something.
  const aiReady = createMemo(
    () =>
      hub().aiActiveProvider != null ||
      (hub().aiLocalEnabled && hub().aiInstalledModels.length > 0),
  );

  const isMac = createMemo(() => platform() === 'darwin');
  // Keyboard-shortcut labels: mac glyphs on macOS, spelled-out keys
  // elsewhere (⌘/⇧ mean nothing on Windows/Linux and the accelerators
  // there are actually Ctrl-based).
  const kbd = (mac: string, other: string) => (isMac() ? mac : other);
  const toolHint = (hint: string) => (isMac() ? hint : hint.replace('⇧', 'Shift'));
  // Top-level tool slots: groups fold their (profile-filtered) members
  // behind one button; ungrouped tools render plain. A group with a
  // single member renders as that plain tool; an empty group is hidden.
  const toolSlots = createMemo<ToolSlot[]>(() => {
    const profile = hub().profile;
    const allowed = new Set(PROFILES[profile].tools);
    const slots: ToolSlot[] = [];
    for (const entry of SLOT_ORDER) {
      if ((GROUP_IDS as string[]).includes(entry)) {
        const gid = entry as GroupId;
        const members = groupToolsForProfile(gid, profile);
        if (members.length === 1) slots.push({ kind: 'tool', tool: members[0] });
        else if (members.length > 1) slots.push({ kind: 'group', group: gid, tools: members });
      } else if (allowed.has(entry as ToolId)) {
        slots.push({ kind: 'tool', tool: entry as ToolId });
      }
    }
    return slots;
  });
  // The tool a group button displays: the active tool when it belongs
  // to the group, else the remembered last-used pick, else the first
  // member (covers profile switches that exclude the remembered tool).
  const shownGroupTool = (group: GroupId, tools: ToolId[]): ToolId => {
    const active = hub().activeTool;
    if (groupOf(active) === group && tools.includes(active)) return active;
    const last = hub().groupLastTool[group];
    if (last && tools.includes(last)) return last;
    return tools[0];
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
          <div class="bar-row">
            {/* ─── MICRO-STRIP: window controls; primary drag region ─── */}
            <div class="strip">
              <Show when={isMac()}>
                <div class="mac-traffic">
                  <button
                    class="mac-light close"
                    onClick={closeApp}
                    title="Quit Lekhini"
                    aria-label="Quit Lekhini"
                  ><span>×</span></button>
                  <button
                    class="mac-light min"
                    onClick={minimize}
                    title="Collapse toolbar"
                    aria-label="Collapse toolbar"
                  ><span>−</span></button>
                </div>
              </Show>
              <Show when={!isMac()}>
                <div class="winctls">
                  <button
                    class="winctl danger"
                    onClick={closeApp}
                    title="Quit Lekhini"
                    aria-label="Quit Lekhini"
                  >{Icons.close()}</button>
                  <button
                    class="winctl"
                    onClick={minimize}
                    title="Collapse toolbar"
                    aria-label="Collapse toolbar"
                  >{Icons.minus()}</button>
                </div>
              </Show>
            </div>

            {/* ─── BRAND: logo doubles as a drag handle ─── */}
            <div class="brand">
              <span class="logo">{Logo()}</span>
            </div>

            {/* ─── TOOLS · ACTIONS · COLOR ─── */}
            <div class="scroll-area" ref={scrollRef}>
              {/* Eye — master draw-mode toggle (Epic Pen style). */}
              <ToolButton
                class="eye-btn"
                active={hub().drawMode}
                title={hub().drawMode ? 'Drawing — click to pause' : 'Idle — click to draw'}
                label={hub().drawMode ? 'Pause drawing' : 'Start drawing'}
                onClick={toggleDraw}
              >
                {hub().drawMode ? Icons.eye() : Icons.eyeOff()}
              </ToolButton>

              <div class="tools-zone">
                <For each={toolSlots()}>
                  {(slot) => {
                    if (slot.kind === 'tool') {
                      const t = TOOL_BY_ID[slot.tool];
                      return (
                        <ToolButton
                          active={hub().activeTool === t.id}
                          title={`${t.label} · ${toolHint(t.hint)}`}
                          label={t.label}
                          onClick={() => setTool(t.id)}
                        >{t.icon()}</ToolButton>
                      );
                    }
                    const g = slot.group;
                    return (
                      <GroupButton
                        ref={(el) => (anchorEls[g] = el)}
                        active={groupOf(hub().activeTool) === g}
                        open={hub().flyout === g}
                        title={`${TOOL_BY_ID[shownGroupTool(g, slot.tools)].label} · hold or re-click for more`}
                        label={GROUP_LABELS[g]}
                        onSelect={() => setTool(shownGroupTool(g, slot.tools))}
                        onOpenFlyout={() => toggleFlyout(g)}
                      >{TOOL_BY_ID[shownGroupTool(g, slot.tools)].icon()}</GroupButton>
                    );
                  }}
                </For>
              </div>

              <div class="zone-sep" />

              <div class="actions-zone">
                <ToolButton
                  title={`Undo · ${kbd('⌘Z', 'Ctrl+Z')}`}
                  label="Undo"
                  onClick={() => window.pen.relay.undo()}
                >{Icons.undo()}</ToolButton>
                <ToolButton
                  title={`Redo · ${kbd('⌘⇧Z', 'Ctrl+Shift+Z')}`}
                  label="Redo"
                  onClick={() => window.pen.relay.redo()}
                >{Icons.redo()}</ToolButton>
                <ToolButton
                  title={`Clear all · ${kbd('⌘⇧C', 'Ctrl+Shift+C')}`}
                  label="Clear all annotations"
                  onClick={() => window.pen.relay.clear()}
                >{Icons.clear()}</ToolButton>
                <ToolButton
                  active={hub().whiteboard !== 'off'}
                  title={`Board: ${hub().whiteboard === 'off' ? 'Off' : hub().whiteboard === 'white' ? 'White' : 'Black'}`}
                  label="Cycle whiteboard background"
                  onClick={cycleBoard}
                >{Icons.whiteboard()}</ToolButton>
                <ToolButton
                  title={`Screenshot · ${kbd('⌘⇧S', 'Ctrl+Shift+S')}`}
                  label="Save screenshot"
                  onClick={() => window.pen.relay.screenshot()}
                >{Icons.camera()}</ToolButton>
                <Show when={hub().profile === 'trader' && aiReady()}>
                  <ToolButton
                    title="Analyze drawn levels with AI"
                    label="Analyze chart"
                    onClick={() => window.pen.relay.analyze()}
                  >{Icons.fib()}</ToolButton>
                </Show>
              </div>

              <div class="zone-sep" />

              {/* ─── COLOR CLUSTER: current-color dot + quick swatches ─── */}
              <div class="color-cluster">
                <button
                  ref={(el) => (anchorEls.color = el)}
                  class={`color-dot ${hub().flyout === 'color' ? 'open' : ''}`}
                  onClick={() => toggleFlyout('color')}
                  title="Color & thickness"
                  aria-label="Color and thickness"
                  aria-haspopup="menu"
                  aria-expanded={hub().flyout === 'color'}
                >
                  <span class="color-dot-fill" style={{ background: hub().settings.color }} />
                  <span class="group-corner" aria-hidden="true" />
                </button>
                <div class="pinned-swatches">
                  <For each={PINNED_COLORS}>
                    {(c) => (
                      <button
                        type="button"
                        class={`swatch mini-swatch ${
                          hub().settings.color.toLowerCase() === c.toLowerCase() ? 'active' : ''
                        }`}
                        style={{ background: c }}
                        onClick={() => setColor(c)}
                        title={c.toUpperCase()}
                        aria-label={`Color ${c.toUpperCase()}`}
                      />
                    )}
                  </For>
                </div>
              </div>
            </div>

            {/* ─── SETTINGS ─── quiet gear pinned at the end. */}
            <div class="bar-end">
              <button
                class={`winctl footer-settings ${hub().settingsOpen ? 'tinted' : ''}`}
                onClick={toggleSettings}
                title="Settings"
                aria-label="Settings"
              >{Icons.gear()}</button>
            </div>
          </div>

          {/* ─── SAVE TOAST ─── transient "Saved · path" pill (4s). */}
          <Show when={hint()}>
            <button
              class={`toast ${revealPath() ? 'is-reveal' : ''}`}
              onClick={() => {
                const p = revealPath();
                if (p) void window.pen.shell.openPath(p);
              }}
              title={revealPath() ? 'Click to reveal in folder' : hint()}
            >
              {hint()}
            </button>
          </Show>
        </div>

        {/* ─── SETTINGS DROPDOWN ─── */}
        <Show when={hub().settingsOpen}>
          <div class="settings-panel">
            <div class="settings-header">
              <span class="settings-title">Settings</span>
              <button
                class="winctl"
                onClick={closeSettings}
                title="Close settings"
                aria-label="Close settings"
              >{Icons.close()}</button>
            </div>

            {/* ── First-run setup wizard ── */}
            <Show when={!hub().aiOnboarded}>
              <div class="settings-section ai-section">
                <div class="settings-section-label">Set up local AI</div>
                <Switch>
                  <Match when={wizardStep() === 'checking'}>
                    <div class="ai-disclosure">Checking for Ollama…</div>
                  </Match>
                  <Match when={wizardStep() === 'install'}>
                    <div class="ai-disclosure">
                      Lekhini runs AI privately on your device using Ollama. Install
                      it once, then come back and re-check.
                    </div>
                    <div class="settings-row">
                      <button
                        class="settings-toggle"
                        onClick={() => void window.pen.ollama.installHelp()}
                      >
                        Install Ollama
                      </button>
                      <button class="settings-toggle" onClick={() => void refreshLocal()}>
                        Re-check
                      </button>
                    </div>
                  </Match>
                  <Match when={wizardStep() === 'start'}>
                    <div class="ai-disclosure">Ollama is installed but not running.</div>
                    <button class="settings-toggle" onClick={() => void startOllama()}>
                      Start service
                    </button>
                  </Match>
                  <Match when={wizardStep() === 'download'}>
                    <div class="ai-disclosure">
                      Download the recommended models (~{defaultModelsTotalGB()} GB
                      total). One-time — it runs in the background.
                    </div>
                    <For each={defaultModels()}>
                      {(m) => (
                        <div class="settings-row">
                          <span class="settings-row-label">
                            {m.label} · {(m.approxBytes / 1e9).toFixed(1)} GB
                          </span>
                          <Show
                            when={pulls()[m.tag]}
                            fallback={
                              <span class="ai-badge-configured">
                                {m.installed ? '● Installed' : '—'}
                              </span>
                            }
                          >
                            {(p) => (
                              <span class="ai-prompt-row-label">
                                {pullPct(p()) != null
                                  ? `${pullPct(p())}%`
                                  : p().status || 'pulling…'}
                              </span>
                            )}
                          </Show>
                        </div>
                      )}
                    </For>
                    <button
                      class="settings-toggle status-btn-primary"
                      onClick={() => void downloadRecommended()}
                    >
                      Download recommended
                    </button>
                  </Match>
                  <Match when={wizardStep() === 'ready'}>
                    <div class="ai-disclosure">✓ You're ready — local AI is set up.</div>
                    <button class="settings-toggle status-btn-primary" onClick={finishOnboarding}>
                      Finish
                    </button>
                  </Match>
                </Switch>
                <a
                  class="ai-key-link"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    skipOnboarding();
                  }}
                >
                  Skip for now
                </a>
              </div>
            </Show>

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

            <div class="settings-section ai-section">
              <div class="settings-section-label">AI</div>

              {/* ── Local-first AI (Ollama) ── */}
              <div class="settings-row">
                <span class="settings-row-label">Local AI (Ollama)</span>
                <button
                  class={`settings-toggle ${hub().aiLocalEnabled ? 'on' : ''}`}
                  onClick={toggleLocalEnabled}
                >
                  <span>{hub().aiLocalEnabled ? 'On' : 'Off'}</span>
                </button>
              </div>
              <Show when={hub().aiLocalEnabled}>
                <div class="settings-row settings-row-stack">
                  <span class="settings-row-label">
                    Service
                    <Show when={ollamaStatus()?.running}>
                      <span class="ai-badge-configured">
                        ● Running{ollamaStatus()?.version ? ` ${ollamaStatus()!.version}` : ''}
                      </span>
                    </Show>
                  </span>
                  <Show when={ollamaStatus() && !ollamaStatus()!.installed}>
                    <div class="ai-test-result fail">
                      Ollama isn't installed.
                      <a
                        class="ai-key-link"
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          void window.pen.ollama.installHelp();
                        }}
                      >
                        {' '}
                        Install Ollama →
                      </a>
                    </div>
                  </Show>
                  <Show when={ollamaStatus()?.installed && !ollamaStatus()?.running}>
                    <button class="settings-toggle" onClick={() => void startOllama()}>
                      Start service
                    </button>
                  </Show>
                </div>

                <Show when={ollamaStatus()?.running}>
                  <div class="settings-row settings-row-stack">
                    <span class="settings-row-label">Models per profile</span>
                    <For each={PROFILE_ORDER}>
                      {(pid) => (
                        <div class="ai-prompt-row">
                          <div class="ai-prompt-row-head">
                            <span class="ai-prompt-row-label">{PROFILES[pid].label}</span>
                          </div>
                          <select
                            class="settings-toggle settings-toggle-wide ai-select"
                            value={hub().aiProfileModels[pid]?.text ?? ''}
                            onChange={(e) =>
                              setProfileModel(
                                pid,
                                'text',
                                (e.currentTarget as HTMLSelectElement).value,
                              )
                            }
                          >
                            <option value="">Text: Auto (recommended)</option>
                            <For each={installedOfKind('text')}>
                              {(m) => <option value={m.tag}>Text: {m.label}</option>}
                            </For>
                          </select>
                          <select
                            class="settings-toggle settings-toggle-wide ai-select"
                            value={hub().aiProfileModels[pid]?.vision ?? ''}
                            onChange={(e) =>
                              setProfileModel(
                                pid,
                                'vision',
                                (e.currentTarget as HTMLSelectElement).value,
                              )
                            }
                          >
                            <option value="">Vision: Auto (recommended)</option>
                            <For each={installedOfKind('vision')}>
                              {(m) => <option value={m.tag}>Vision: {m.label}</option>}
                            </For>
                          </select>
                        </div>
                      )}
                    </For>
                  </div>
                  <div class="settings-row settings-row-stack">
                    <span class="settings-row-label">Models</span>
                    <For each={localModels()}>
                      {(m) => (
                        <div class="ai-prompt-row">
                          <div class="ai-prompt-row-head">
                            <span class="ai-prompt-row-label">
                              {m.label} · {(m.approxBytes / 1e9).toFixed(1)} GB
                            </span>
                            <Show
                              when={pulls()[m.tag]}
                              fallback={
                                <Show
                                  when={m.installed}
                                  fallback={
                                    <button
                                      class="ai-prompt-reset"
                                      onClick={() => void pullModel(m.tag)}
                                    >
                                      Install
                                    </button>
                                  }
                                >
                                  <button
                                    class="ai-prompt-reset"
                                    onClick={() => void deleteModel(m.tag)}
                                    title="Remove this model"
                                  >
                                    Remove
                                  </button>
                                </Show>
                              }
                            >
                              {(p) => (
                                <span class="ai-prompt-row-label">
                                  {pullPct(p()) != null
                                    ? `${pullPct(p())}%`
                                    : p().status || 'pulling…'}
                                  <button
                                    class="ai-prompt-reset"
                                    onClick={() => cancelPull(m.tag)}
                                  >
                                    Cancel
                                  </button>
                                </span>
                              )}
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>

              {/* ── Autocorrect + default font ── */}
              <div class="settings-row">
                <span class="settings-row-label">Autocorrect typed text</span>
                <button
                  class={`settings-toggle ${hub().autocorrectTyped ? 'on' : ''}`}
                  onClick={toggleAutocorrectTyped}
                >
                  <span>{hub().autocorrectTyped ? 'On' : 'Off'}</span>
                </button>
              </div>
              <div class="settings-row">
                <span class="settings-row-label">Autocorrect drawn text</span>
                <button
                  class={`settings-toggle ${hub().autocorrectDrawn ? 'on' : ''}`}
                  onClick={toggleAutocorrectDrawn}
                >
                  <span>{hub().autocorrectDrawn ? 'On' : 'Off'}</span>
                </button>
              </div>
              <div class="settings-row settings-row-stack">
                <span class="settings-row-label">Default text font</span>
                <select
                  class="settings-toggle settings-toggle-wide ai-select"
                  value={hub().defaultTextFont}
                  onChange={(e) =>
                    setDefaultFont((e.currentTarget as HTMLSelectElement).value)
                  }
                >
                  <For each={TEXT_FONTS}>
                    {(f) => <option value={f.value}>{f.label}</option>}
                  </For>
                </select>
              </div>

              {/* ── Cloud provider (optional fallback) ── */}
              <div class="settings-section-label">Cloud fallback</div>
              <div class="settings-row settings-row-stack">
                <span class="settings-row-label">Provider</span>
                <select
                  class="settings-toggle settings-toggle-wide ai-select"
                  value={aiSelectedProvider()}
                  onChange={(e) =>
                    setAiSelectedProvider(
                      (e.currentTarget as HTMLSelectElement).value as CloudProviderId,
                    )
                  }
                >
                  <For each={Object.keys(PROVIDER_LABELS) as CloudProviderId[]}>
                    {(p) => (
                      <option value={p}>
                        {PROVIDER_LABELS[p]}
                        {isProviderConfigured(p) ? ' · configured' : ''}
                      </option>
                    )}
                  </For>
                </select>
              </div>
              <div class="settings-row settings-row-stack">
                <span class="settings-row-label">Model</span>
                <select
                  class="settings-toggle settings-toggle-wide ai-select"
                  value={aiSelectedModel()}
                  onChange={(e) =>
                    onModelChange((e.currentTarget as HTMLSelectElement).value)
                  }
                >
                  <For each={MODELS_BY_PROVIDER[aiSelectedProvider()]}>
                    {(m) => <option value={m.id}>{m.label}</option>}
                  </For>
                </select>
              </div>
              <div class="settings-row settings-row-stack">
                <span class="settings-row-label">
                  API key
                  <Show when={isProviderConfigured(aiSelectedProvider())}>
                    <span class="ai-badge-configured">● Configured</span>
                  </Show>
                </span>
                <input
                  class="ai-key-input"
                  type="password"
                  autocomplete="off"
                  spellcheck={false}
                  placeholder={
                    isProviderConfigured(aiSelectedProvider())
                      ? 'Replace key…'
                      : 'Paste API key'
                  }
                  value={aiKeyInput()}
                  onInput={(e) =>
                    setAiKeyInput((e.currentTarget as HTMLInputElement).value)
                  }
                />
                <div class="ai-key-actions">
                  <button
                    class="settings-toggle"
                    onClick={() => void saveAiKey()}
                    disabled={aiKeyInput().trim().length === 0 || aiBusy() !== null}
                  >
                    {aiBusy() === 'saving' ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    class="settings-toggle"
                    onClick={() => void testAiConnection()}
                    disabled={
                      !isProviderConfigured(aiSelectedProvider()) || aiBusy() !== null
                    }
                  >
                    {aiBusy() === 'testing' ? 'Testing…' : 'Test'}
                  </button>
                  <Show when={isProviderConfigured(aiSelectedProvider())}>
                    <button
                      class="settings-toggle ai-key-delete"
                      onClick={() => void deleteAiKey()}
                      title="Remove the saved key for this provider"
                    >
                      Delete
                    </button>
                  </Show>
                </div>
                <Show when={aiTestResult()}>
                  {(r) => (
                    <div
                      class={`ai-test-result ${r().ok ? 'ok' : 'fail'}`}
                    >
                      {r().ok
                        ? `✓ ${r().message ?? 'OK'}${
                            r().latencyMs ? ` · ${r().latencyMs}ms` : ''
                          }`
                        : `✗ ${r().message ?? 'Failed'}`}
                    </div>
                  )}
                </Show>
                <a
                  class="ai-key-link"
                  href={PROVIDER_KEY_URLS[aiSelectedProvider()]}
                  onClick={(e) => {
                    e.preventDefault();
                    void window.pen.shell.openPath(PROVIDER_KEY_URLS[aiSelectedProvider()]);
                  }}
                >
                  Get a key →
                </a>
              </div>
              <div class="settings-row settings-row-stack">
                <span class="settings-row-label">Profile prompts</span>
                <For each={PROFILE_ORDER}>
                  {(pid) => (
                    <div class="ai-prompt-row">
                      <div class="ai-prompt-row-head">
                        <span class="ai-prompt-row-label">{PROFILES[pid].label}</span>
                        <Show when={hub().aiProfilePrompts[pid]}>
                          <button
                            class="ai-prompt-reset"
                            onClick={() => resetProfilePrompt(pid)}
                            title="Restore the built-in prompt"
                          >
                            Reset
                          </button>
                        </Show>
                      </div>
                      <textarea
                        class="ai-prompt-textarea"
                        rows={3}
                        value={resolveAiPrompt(pid, hub().aiProfilePrompts)}
                        onChange={(e) =>
                          setProfilePrompt(
                            pid,
                            (e.currentTarget as HTMLTextAreaElement).value,
                          )
                        }
                      />
                    </div>
                  )}
                </For>
              </div>
              <div class="ai-disclosure">
                With Local AI on, text and images stay on your device — nothing
                is sent to a server. The cloud fallback (above) is only used when
                Local AI is off or no local model is installed; in that case your
                content goes directly to the selected provider under its own
                data-handling policy. Lekhini does not log or proxy it.
              </div>

              {/* ── Learning (on-device RAG) ── */}
              <div class="settings-section-label">Learning</div>
              <For each={PROFILE_ORDER}>
                {(pid) => (
                  <div class="settings-row">
                    <span class="settings-row-label">
                      {PROFILES[pid].label}
                      <span class="ai-badge-configured">
                        {ragStats()[pid] ?? 0} examples
                      </span>
                    </span>
                    <button
                      class="settings-toggle"
                      onClick={() => void resetLearning(pid)}
                      disabled={(ragStats()[pid] ?? 0) === 0}
                      title="Forget everything learned for this profile"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </For>
              <div class="ai-disclosure">
                Autocorrect learns from the corrections you accept and from
                bundled starter examples, stored only on this device. Requires
                the local embedding model (nomic-embed-text).
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
              <div class="settings-section-label">Updates</div>
              <div class="settings-row">
                <span class="settings-row-label">Automatic updates</span>
                <button
                  class={`settings-toggle ${hub().autoUpdate ? 'on' : ''}`}
                  onClick={toggleAutoUpdate}
                >
                  <span>{hub().autoUpdate ? 'On' : 'Off'}</span>
                </button>
              </div>
              <div class="settings-row settings-row-stack">
                <span class="settings-row-label">
                  Version
                  <span class="ai-badge-configured">v{appInfo().version}</span>
                </span>
                <Show when={updateLine()}>
                  <div
                    class={`ai-test-result ${
                      updateStatus()?.state === 'error' ? 'fail' : 'ok'
                    }`}
                  >
                    {updateLine()}
                  </div>
                </Show>
                <div class="ai-key-actions">
                  <button
                    class="settings-toggle"
                    onClick={checkForUpdates}
                    disabled={
                      updateStatus()?.state === 'checking' ||
                      updateStatus()?.state === 'downloading'
                    }
                  >
                    {updateStatus()?.state === 'checking' ? 'Checking…' : 'Check for updates'}
                  </button>
                  <Show
                    when={
                      updateStatus()?.state === 'downloaded' ||
                      updateStatus()?.state === 'available'
                    }
                  >
                    <button class="settings-toggle status-btn-primary" onClick={installUpdate}>
                      {updateStatus()?.state === 'downloaded'
                        ? 'Restart to update'
                        : 'Download & install'}
                    </button>
                  </Show>
                </div>
                {/* Manual fallback when auto-update can't apply (dev run,
                    or unsigned macOS where Squirrel refuses updates). */}
                <Show when={updateStatus()?.state === 'unsupported'}>
                  <a
                    class="ai-key-link"
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      openReleases();
                    }}
                  >
                    Download the latest from GitHub →
                  </a>
                </Show>
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

        {/* ─── CHAT PANEL (AI integration) ──────────────────────────
             Shares the dock slot with Settings + Status. Mutual
             exclusion is enforced in hub.patch — opening this closes
             the others. Settings still has render priority though,
             so a user mid-chat who opens Settings sees Settings and
             the chat is hidden until they close it. */}
        <Show when={hub().chatOpen && !hub().settingsOpen && panelKind() === null}>
          <ChatPanel
            provider={hub().aiActiveProvider}
            model={hub().aiActiveModel}
            aiReady={aiReady()}
            session={chatSession()}
            promptOverrides={hub().aiProfilePrompts}
            onClose={closeChat}
          />
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
                title="Close"
                aria-label="Close"
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

        {/* ─── FLYOUT CARD ─── floating tool / color card beside its
             anchor button (Epic Pen style). Keyed so the card remounts
             (and re-measures its position) per flyout id. */}
        <Show when={hub().flyout} keyed>
          {(fid) => (
            <FlyoutCard
              anchor={flyoutAnchor() ?? new DOMRect(8, 8, 40, 40)}
              orient={hub().orientation}
              side={settingsOnLeft() ? 'left' : 'right'}
              label={fid === 'color' ? 'Color and thickness' : GROUP_LABELS[fid as GroupId]}
            >
              <Show
                when={fid === 'color'}
                fallback={
                  <For each={groupToolsForProfile(fid as GroupId, hub().profile)}>
                    {(t) => (
                      <ToolButton
                        active={hub().activeTool === t}
                        title={`${TOOL_BY_ID[t].label} · ${toolHint(TOOL_BY_ID[t].hint)}`}
                        label={TOOL_BY_ID[t].label}
                        onClick={() => setTool(t)}
                      >{TOOL_BY_ID[t].icon()}</ToolButton>
                    )}
                  </For>
                }
              >
                <ColorFlyout
                  color={hub().settings.color}
                  width={hub().settings.width}
                  tool={hub().activeTool}
                  onColor={setColor}
                  onWidth={pickThickness}
                />
              </Show>
            </FlyoutCard>
          )}
        </Show>
      </Show>
    </div>
  );
}
