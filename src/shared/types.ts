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
};

// ── AI integration types ───────────────────────────────────────────

export type ProviderId = 'anthropic' | 'openai' | 'gemini';

export interface AiStatus {
  provider: ProviderId;
  configured: boolean;
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
  | 'ai:chunk';

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
