export type ToolId =
  | 'pencil'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'hand'
  | 'line'
  | 'trendline'
  | 'fib'
  | 'region'
  | 'ellipse'
  | 'arrow'
  | 'text'
  | 'snip';

export type Whiteboard = 'off' | 'white' | 'black';

export type Theme = 'dark' | 'light';

export type ProfileId = 'general' | 'teacher' | 'trader';

export interface Point {
  x: number;
  y: number;
  p: number;
  t: number;
}

export interface StrokeItem {
  kind: 'stroke';
  id: string;
  tool: 'pencil' | 'pen' | 'highlighter';
  points: Point[];
  color: string;
  width: number;
  opacity: number;
}

export interface LineShape {
  kind: 'line' | 'trendline';
  id: string;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  color: string;
  width: number;
  opacity: number;
}

export interface FibShape {
  kind: 'fib';
  id: string;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  levels: number[];
  color: string;
  opacity: number;
  showLabels: boolean;
}

export interface RegionShape {
  kind: 'region';
  id: string;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  color: string;
  opacity: number;
  // When set, render with the high-contrast B/W marching-ants pattern
  // used for selection rectangles (snip preview). Without it the
  // 1px-dashed white stroke is invisible against most desktops.
  marchingAnts?: boolean;
}

export interface EllipseShape {
  kind: 'ellipse';
  id: string;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  color: string;
  width: number;
  opacity: number;
  fill: boolean;
}

export interface ArrowShape {
  kind: 'arrow';
  id: string;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  color: string;
  width: number;
}

export interface TextShape {
  kind: 'text';
  id: string;
  at: { x: number; y: number };
  text: string;
  color: string;
  fontSize: number;
  // CSS font-family stamped at creation from the user's default-font
  // setting. Optional for back-compat with items saved before the
  // setting existed; drawText falls back to the system stack.
  fontFamily?: string;
}

export type Item =
  | StrokeItem
  | LineShape
  | FibShape
  | RegionShape
  | EllipseShape
  | ArrowShape
  | TextShape;

export interface Calibration {
  p1: { pixel: { x: number; y: number }; price: number; timeMs: number };
  p2: { pixel: { x: number; y: number }; price: number; timeMs: number };
}

export interface ToolSettings {
  color: string;
  width: number;
  opacity: number;
}

export interface PerToolWidth {
  pencil: number;
  pen: number;
  eraser: number;
  highlighter: number;
}

export type Orientation = 'h' | 'v';

export type HubStateUpdate = {
  activeTool?: ToolId;
  drawMode?: boolean;
  settings?: Partial<ToolSettings>;
  calibration?: Calibration | null;
  orientation?: Orientation;
  minimized?: boolean;
  whiteboard?: Whiteboard;
  theme?: Theme;
  profile?: ProfileId;
  settingsOpen?: boolean;
  thicknessFlyoutOpen?: boolean;
  perToolWidth?: Partial<PerToolWidth>;
  saveDir?: string | null;
  alwaysAskSavePath?: boolean;
  // Transient — not persisted. Mirrors whether the renderer is
  // showing the status side panel (permission / save error) so
  // main can resize the toolbar window to fit it, the same way it
  // does for settingsOpen.
  statusPanelOpen?: boolean;
  // AI integration. chatOpen is transient (panel visibility);
  // the others persist in PersistedState too.
  chatOpen?: boolean;
  aiActiveProvider?: ProviderId | null;
  aiActiveModel?: string | null;
  aiProfilePrompts?: Partial<Record<ProfileId, string>>;
  // Local (Ollama) AI. aiLocalEnabled flips local-first on; when on and
  // a model is installed the resolver prefers local over cloud.
  aiLocalEnabled?: boolean;
  aiInstalledModels?: string[];
  aiLocalModel?: string | null; // global default text model tag (fallback)
  aiLocalVisionModel?: string | null; // global default vision model tag (fallback)
  aiProfileModels?: AiProfileModels; // per-profile model overrides

  // Autocorrect toggles — independent for typed text and drawn ink.
  autocorrectTyped?: boolean;
  autocorrectDrawn?: boolean;
  // CSS font-family for newly created text (typed + recognized).
  defaultTextFont?: string;
  // First-run setup wizard completed (or skipped).
  aiOnboarded?: boolean;
  // Auto-update preference. When true (default) new versions download
  // in the background and install on quit; when false the app only
  // notifies and waits for an explicit "Restart to update".
  autoUpdate?: boolean;
};

// Auto-update lifecycle, surfaced to the renderer via the 'updater:status'
// event and the 'updater:get' snapshot. `unsupported` covers the macOS
// unsigned case (Squirrel.Mac refuses unsigned updates) and dev runs —
// there the UI offers a manual "Download from GitHub" link instead.
export interface UpdateStatus {
  state:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'none'
    | 'error'
    | 'unsupported';
  // Running app version (always populated).
  currentVersion: string;
  // The newer version, when one is available/downloaded.
  version?: string;
  // Download progress, 0–100, while state === 'downloading'.
  percent?: number;
  // Human-readable detail for 'error'/'unsupported'.
  message?: string;
}

// ── AI integration types ───────────────────────────────────────────

// 'ollama' is the local-first provider (no API key — models run on the
// user's machine via the Ollama service). The cloud providers stay
// available as an opt-in fallback. Note: DeepSeek is text-only (its API
// rejects image input), so image snips routed to it answer from text
// alone — for image Q&A prefer local vision or Claude / GPT-4o / Gemini.
// 'sarvam' IS vision-capable: its adapter OCRs the image via Sarvam
// Document Intelligence, then solves with Sarvam's own chat model.
export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'sarvam' | 'ollama';

export interface AiStatus {
  provider: ProviderId;
  configured: boolean;
}

// Per-profile local model overrides. Each profile can pin a text model
// (grammar / chat / analysis) and a vision model (screenshot Q&A / OCR);
// anything unset falls back to the catalogue default for that profile.
export type AiProfileModels = Partial<Record<ProfileId, { text?: string; vision?: string }>>;

// ── Local (Ollama) types ───────────────────────────────────────────

// One entry in the local model catalogue surfaced in the installer.
export interface LocalModelInfo {
  // Ollama tag, e.g. 'llama3.2:1b'.
  tag: string;
  label: string;
  kind: 'text' | 'vision' | 'embed';
  approxBytes: number;
  // True once the tag is present in the local Ollama library.
  installed: boolean;
  // True for the first-run default set the setup wizard pulls.
  defaultPull?: boolean;
}

export interface OllamaServiceStatus {
  installed: boolean; // ollama binary / daemon reachable
  running: boolean; // /api/version answered
  version?: string;
  error?: string;
}

export interface OllamaPullProgress {
  model: string;
  status: string;
  completed?: number;
  total?: number;
  done?: boolean;
  error?: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskInput {
  provider: ProviderId;
  model: string;
  systemPrompt: string;
  // PNG attached to the FIRST user turn only. Renderer encodes the
  // snip and sends bytes through IPC; main decodes and forwards to
  // the provider in whatever shape it wants.
  image?: { mime: string; base64: string };
  history: ChatTurn[];
  userMessage: string;
  // The active profile, when known. Lets the resolver pick the
  // per-profile model and (later) inject profile-specific RAG context.
  profile?: ProfileId;
  // The chat session this turn belongs to. Main caches the snip image
  // (and, for Sarvam, the one-shot OCR text) per session so follow-up
  // turns retain the original image/problem context without the
  // renderer re-uploading it or re-running OCR each time.
  sessionId?: string;
}

export interface StreamChunk {
  requestId: string;
  delta?: string;
  done?: boolean;
  error?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  message?: string;
  // Round-trip duration in milliseconds, populated on ok=true.
  latencyMs?: number;
}

// Payload of the chat:session broadcast — sent from main to every
// renderer when SnipActions kicks off a new AI chat. The toolbar's
// ChatPanel picks this up to render the image thumbnail + auto-fire
// the first turn against the configured provider.
export interface ChatSessionPayload {
  sessionId: string;
  // Image sessions (snip "Ask AI") carry a PNG; text-only sessions
  // (e.g. the trader numeric-analysis flow) omit it.
  png?: Uint8Array;
  mime?: string;
  // For a text-only session: the first user message to auto-send
  // (e.g. the computed technical levels). Image sessions leave this
  // empty and auto-fire with "".
  initialText?: string;
  // The profile the user was in when they clicked Ask AI. Stays
  // bound to the chat — profile switches mid-conversation don't
  // retroactively re-prime the system prompt.
  profile: ProfileId;
}

export type IpcChannel =
  | 'hub:state:get'
  | 'hub:state:update'
  | 'hub:state:broadcast'
  | 'overlay:undo'
  | 'overlay:redo'
  | 'overlay:clear'
  | 'overlay:screenshot'
  | 'overlay:snip'
  | 'overlay:snip-selection'
  | 'overlay:request-focus'
  | 'overlay:release-focus'
  | 'capture:screenshot:result'
  | 'capture:snip:result'
  | 'capture:trigger'
  | 'capture:saved'
  | 'capture:error'
  | 'snip:set'
  | 'snip:clear'
  | 'snip:copy'
  | 'relay:undo'
  | 'relay:redo'
  | 'relay:clear'
  | 'window:close'
  | 'window:minimize'
  | 'window:platform'
  | 'toolbar:on-right-side'
  | 'toolbar:set-content-size'
  | 'app:info'
  // Auto-update (electron-updater → GitHub Releases). `get` returns the
  // current snapshot; `check` forces a check; `install` quits and
  // applies a downloaded update; `open-releases` opens the GitHub
  // Releases page (manual fallback, e.g. unsigned macOS); `status` is
  // the push event the renderer subscribes to.
  | 'updater:get'
  | 'updater:check'
  | 'updater:install'
  | 'updater:open-releases'
  | 'updater:status'
  | 'permissions:check'
  | 'permissions:open'
  | 'permissions:needed'
  | 'permissions:status'
  | 'permissions:deep-recheck'
  | 'app:relaunch'
  | 'settings:save-dir:pick'
  | 'shell:open-path'
  // AI integration
  | 'ai:set-key'
  | 'ai:delete-key'
  | 'ai:get-status'
  | 'ai:test-connection'
  | 'ai:ask'
  | 'ai:cancel'
  | 'ai:chunk'
  // Non-streaming one-shot calls: recognize handwriting (image→text)
  // and autocorrect typed text (text→text). Both resolve provider/
  // model the same way ai:ask does.
  | 'ai:recognize'
  | 'ai:autocorrect'
  // Local Ollama service management.
  | 'ollama:status'
  | 'ollama:start'
  | 'ollama:pull'
  | 'ollama:pull-progress'
  | 'ollama:cancel-pull'
  | 'ollama:delete-model'
  | 'ollama:list-models'
  | 'ollama:disk-space'
  | 'ollama:install-help'
  // Local RAG "self-learning" store.
  | 'rag:stats'
  | 'rag:reset-profile'
  | 'rag:capture'
  // Cross-window chat-session handoff: overlay's SnipActions starts
  // a chat with a snip image; main broadcasts a session event so the
  // toolbar's ChatPanel receives the image and opens.
  | 'chat:start'
  | 'chat:start-text'
  | 'chat:session'
  // Trader hybrid: toolbar asks the focused overlay to compute its
  // drawn technical levels and open a text-only analysis chat.
  | 'relay:analyze'
  | 'overlay:analyze'
  // Renderer-friendly shortcut: ask AI about the current snip
  // selection. Main captures + composites the focused display's
  // snip (same path as Save), then internally calls chat:start with
  // the bytes — no need for the renderer to handle PNG capture.
  | 'snip:ask-ai';

export interface CaptureSaved {
  path: string;
}

export interface CaptureError {
  message: string;
  recoverable: boolean;
}

export type PermissionReason = 'screen';

export interface PermissionNeeded {
  reason: PermissionReason;
}

export type ScreenPermissionStatus =
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'restricted'
  | 'unknown';

export interface PermissionStatus {
  screen: ScreenPermissionStatus;
}
