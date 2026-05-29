import { contextBridge, ipcRenderer } from 'electron';
import type {
  AiStatus,
  AskInput,
  ChatSessionPayload,
  ConnectionTestResult,
  HubStateUpdate,
  IpcChannel,
  LocalModelInfo,
  OllamaPullProgress,
  OllamaServiceStatus,
  ProfileId,
  ProviderId,
  StreamChunk,
  UpdateStatus,
} from '../shared/types';

const api = {
  hub: {
    get: () => ipcRenderer.invoke('hub:state:get' satisfies IpcChannel),
    update: (patch: HubStateUpdate) =>
      ipcRenderer.invoke('hub:state:update' satisfies IpcChannel, patch),
    onBroadcast: (cb: (state: unknown) => void) => {
      const handler = (_: unknown, state: unknown) => cb(state);
      ipcRenderer.on('hub:state:broadcast' satisfies IpcChannel, handler);
      return () => ipcRenderer.off('hub:state:broadcast' satisfies IpcChannel, handler);
    },
  },
  overlay: {
    onUndo: (cb: () => void) => bind('overlay:undo', cb),
    onRedo: (cb: () => void) => bind('overlay:redo', cb),
    onClear: (cb: () => void) => bind('overlay:clear', cb),
    onAnalyze: (cb: () => void) => bind('overlay:analyze', cb),
    onScreenshot: (cb: (payload: { png: Uint8Array }) => void) =>
      bind('overlay:screenshot', cb as (v: unknown) => void),
    onSnip: (
      cb: (payload: {
        png: Uint8Array;
        rect: { x: number; y: number; w: number; h: number };
        scaleFactor: number;
      }) => void,
    ) => bind('overlay:snip', cb as (v: unknown) => void),
    onSnipSelection: (
      cb: (rect: { x: number; y: number; w: number; h: number } | null) => void,
    ) => bind('overlay:snip-selection', cb as (v: unknown) => void),
    requestFocus: () => ipcRenderer.invoke('overlay:request-focus' satisfies IpcChannel),
    releaseFocus: () => ipcRenderer.invoke('overlay:release-focus' satisfies IpcChannel),
    sendScreenshotResult: (png: Uint8Array) =>
      ipcRenderer.invoke('capture:screenshot:result' satisfies IpcChannel, png),
    sendSnipResult: (png: Uint8Array) =>
      ipcRenderer.invoke('capture:snip:result' satisfies IpcChannel, png),
  },
  snip: {
    set: (payload: {
      rect: { x: number; y: number; w: number; h: number };
      displayId: number;
    }) => ipcRenderer.invoke('snip:set' satisfies IpcChannel, payload),
    clear: (payload: { displayId: number }) =>
      ipcRenderer.invoke('snip:clear' satisfies IpcChannel, payload),
    copy: () => ipcRenderer.invoke('snip:copy' satisfies IpcChannel),
    askAi: (profile: ProfileId) =>
      ipcRenderer.invoke('snip:ask-ai' satisfies IpcChannel, { profile }),
  },
  relay: {
    undo: () => ipcRenderer.invoke('relay:undo' satisfies IpcChannel),
    redo: () => ipcRenderer.invoke('relay:redo' satisfies IpcChannel),
    clear: () => ipcRenderer.invoke('relay:clear' satisfies IpcChannel),
    analyze: () => ipcRenderer.invoke('relay:analyze' satisfies IpcChannel),
    screenshot: () => ipcRenderer.invoke('capture:trigger' satisfies IpcChannel),
  },
  win: {
    close: () => ipcRenderer.invoke('window:close' satisfies IpcChannel),
    minimize: () => ipcRenderer.invoke('window:minimize' satisfies IpcChannel),
    platform: () => ipcRenderer.invoke('window:platform' satisfies IpcChannel),
    toolbarOnRightSide: () =>
      ipcRenderer.invoke('toolbar:on-right-side' satisfies IpcChannel) as Promise<boolean>,
    setContentSize: (payload: { axis: 'h' | 'v'; size: number }) =>
      ipcRenderer.invoke('toolbar:set-content-size' satisfies IpcChannel, payload),
  },
  permissions: {
    check: () => ipcRenderer.invoke('permissions:check' satisfies IpcChannel),
    deepCheck: () => ipcRenderer.invoke('permissions:deep-recheck' satisfies IpcChannel),
    open: (which: 'screen' | 'accessibility') =>
      ipcRenderer.invoke('permissions:open' satisfies IpcChannel, which),
    onNeeded: (cb: (payload: { reason: 'screen' }) => void) =>
      bind('permissions:needed', cb as (v: unknown) => void),
    onStatus: (
      cb: (payload: {
        screen: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
        probeError?: boolean;
      }) => void,
    ) => bind('permissions:status', cb as (v: unknown) => void),
  },
  capture: {
    onSaved: (cb: (payload: { path: string }) => void) =>
      bind('capture:saved', cb as (v: unknown) => void),
    onError: (cb: (payload: { message: string; recoverable: boolean }) => void) =>
      bind('capture:error', cb as (v: unknown) => void),
  },
  settings: {
    // saveDir + alwaysAskSavePath are part of HubState — write them
    // via `pen.hub.update({ saveDir, alwaysAskSavePath })`. This
    // method only opens the OS folder-picker dialog and returns the
    // chosen path so the renderer can patch the hub with it.
    pickSaveDir: () =>
      ipcRenderer.invoke('settings:save-dir:pick' satisfies IpcChannel) as Promise<string | null>,
  },
  shell: {
    openPath: (p: string) =>
      ipcRenderer.invoke('shell:open-path' satisfies IpcChannel, p),
  },
  ai: {
    setKey: (provider: ProviderId, key: string) =>
      ipcRenderer.invoke('ai:set-key' satisfies IpcChannel, { provider, key }),
    deleteKey: (provider: ProviderId) =>
      ipcRenderer.invoke('ai:delete-key' satisfies IpcChannel, { provider }),
    getStatus: () =>
      ipcRenderer.invoke('ai:get-status' satisfies IpcChannel) as Promise<AiStatus[]>,
    testConnection: (provider: ProviderId, model: string) =>
      ipcRenderer.invoke('ai:test-connection' satisfies IpcChannel, {
        provider,
        model,
      }) as Promise<ConnectionTestResult>,
    ask: (input: AskInput) =>
      ipcRenderer.invoke('ai:ask' satisfies IpcChannel, input) as Promise<{
        requestId: string;
      }>,
    cancel: (requestId: string) =>
      ipcRenderer.invoke('ai:cancel' satisfies IpcChannel, { requestId }),
    onChunk: (cb: (c: StreamChunk) => void) =>
      bind('ai:chunk', cb as (v: unknown) => void),
    // One-shot correction calls (non-streaming).
    recognize: (payload: { png: Uint8Array; mime?: string; profile?: ProfileId }) =>
      ipcRenderer.invoke('ai:recognize' satisfies IpcChannel, payload) as Promise<{
        text: string;
        error?: string;
      }>,
    autocorrect: (payload: { text: string; profile?: ProfileId }) =>
      ipcRenderer.invoke('ai:autocorrect' satisfies IpcChannel, payload) as Promise<{
        text: string;
        error?: string;
      }>,
  },
  ollama: {
    status: () =>
      ipcRenderer.invoke('ollama:status' satisfies IpcChannel) as Promise<OllamaServiceStatus>,
    start: () =>
      ipcRenderer.invoke('ollama:start' satisfies IpcChannel) as Promise<OllamaServiceStatus>,
    listModels: () =>
      ipcRenderer.invoke('ollama:list-models' satisfies IpcChannel) as Promise<LocalModelInfo[]>,
    diskSpace: () =>
      ipcRenderer.invoke('ollama:disk-space' satisfies IpcChannel) as Promise<number>,
    pull: (model: string) =>
      ipcRenderer.invoke('ollama:pull' satisfies IpcChannel, { model }) as Promise<{ ok: boolean }>,
    cancelPull: (model: string) =>
      ipcRenderer.invoke('ollama:cancel-pull' satisfies IpcChannel, { model }) as Promise<void>,
    deleteModel: (model: string) =>
      ipcRenderer.invoke('ollama:delete-model' satisfies IpcChannel, { model }) as Promise<void>,
    installHelp: () =>
      ipcRenderer.invoke('ollama:install-help' satisfies IpcChannel) as Promise<void>,
    onPullProgress: (cb: (p: OllamaPullProgress) => void) =>
      bind('ollama:pull-progress', cb as (v: unknown) => void),
  },
  rag: {
    stats: () =>
      ipcRenderer.invoke('rag:stats' satisfies IpcChannel) as Promise<
        Record<ProfileId, number>
      >,
    resetProfile: (profile: ProfileId) =>
      ipcRenderer.invoke('rag:reset-profile' satisfies IpcChannel, { profile }) as Promise<void>,
    capture: (payload: {
      profile: ProfileId;
      kind: 'typed' | 'drawn' | 'analysis' | 'chat';
      original: string;
      corrected: string;
    }) => ipcRenderer.invoke('rag:capture' satisfies IpcChannel, payload) as Promise<void>,
  },
  chat: {
    // Called by SnipActions in the overlay to hand a snip off to the
    // toolbar's ChatPanel. Main relays via chat:session.
    start: (payload: { png: Uint8Array; mime: string; profile: ProfileId }) =>
      ipcRenderer.invoke('chat:start' satisfies IpcChannel, payload) as Promise<{
        sessionId: string;
      }>,
    startText: (payload: { text: string; profile: ProfileId }) =>
      ipcRenderer.invoke('chat:start-text' satisfies IpcChannel, payload) as Promise<{
        sessionId: string;
      }>,
    onSession: (cb: (s: ChatSessionPayload) => void) =>
      bind('chat:session', cb as (v: unknown) => void),
  },
  app: {
    info: () =>
      ipcRenderer.invoke('app:info' satisfies IpcChannel) as Promise<{
        name: string;
        version: string;
      }>,
    relaunch: () => ipcRenderer.invoke('app:relaunch' satisfies IpcChannel),
  },
  updater: {
    get: () => ipcRenderer.invoke('updater:get' satisfies IpcChannel) as Promise<UpdateStatus>,
    check: () => ipcRenderer.invoke('updater:check' satisfies IpcChannel) as Promise<UpdateStatus>,
    install: () => ipcRenderer.invoke('updater:install' satisfies IpcChannel) as Promise<void>,
    openReleases: () =>
      ipcRenderer.invoke('updater:open-releases' satisfies IpcChannel) as Promise<void>,
    onStatus: (cb: (s: UpdateStatus) => void) =>
      bind('updater:status', cb as (v: unknown) => void),
  },
  env: {
    displayId: () => ipcRenderer.sendSync('overlay:display-id'),
  },
};

function bind(channel: IpcChannel, cb: (v: unknown) => void) {
  const handler = (_: unknown, value: unknown) => cb(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

contextBridge.exposeInMainWorld('pen', api);

export type PenApi = typeof api;
