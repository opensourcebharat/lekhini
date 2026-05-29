import type {
  AiStatus,
  AskInput,
  ChatSessionPayload,
  ConnectionTestResult,
  HubStateUpdate,
  LocalModelInfo,
  OllamaPullProgress,
  OllamaServiceStatus,
  ProfileId,
  ProviderId,
  ScreenPermissionStatus,
  StreamChunk,
  UpdateStatus,
} from '../shared/types';

declare global {
  interface Window {
    pen: {
      hub: {
        get(): Promise<unknown>;
        update(patch: HubStateUpdate): Promise<unknown>;
        onBroadcast(cb: (state: unknown) => void): () => void;
      };
      overlay: {
        onUndo(cb: () => void): () => void;
        onRedo(cb: () => void): () => void;
        onClear(cb: () => void): () => void;
        onAnalyze(cb: () => void): () => void;
        onScreenshot(cb: (payload: { png: Uint8Array }) => void): () => void;
        onSnip(
          cb: (payload: {
            png: Uint8Array;
            rect: { x: number; y: number; w: number; h: number };
            scaleFactor: number;
          }) => void,
        ): () => void;
        onSnipSelection(
          cb: (rect: { x: number; y: number; w: number; h: number } | null) => void,
        ): () => void;
        requestFocus(): Promise<void>;
        releaseFocus(): Promise<void>;
        sendScreenshotResult(png: Uint8Array): Promise<void>;
        sendSnipResult(png: Uint8Array): Promise<void>;
      };
      snip: {
        set(payload: {
          rect: { x: number; y: number; w: number; h: number };
          displayId: number;
        }): Promise<void>;
        clear(payload: { displayId: number }): Promise<void>;
        copy(): Promise<void>;
        askAi(profile: ProfileId): Promise<void>;
      };
      relay: {
        undo(): Promise<void>;
        redo(): Promise<void>;
        clear(): Promise<void>;
        analyze(): Promise<void>;
        screenshot(): Promise<void>;
      };
      win: {
        close(): Promise<void>;
        minimize(): Promise<void>;
        platform(): Promise<NodeJS.Platform>;
        toolbarOnRightSide(): Promise<boolean>;
        setContentSize(payload: { axis: 'h' | 'v'; size: number }): Promise<void>;
      };
      permissions: {
        check(): Promise<{ screen: ScreenPermissionStatus; accessibility: boolean }>;
        deepCheck(): Promise<{ screen: ScreenPermissionStatus; probeError: boolean }>;
        open(which: 'screen' | 'accessibility'): Promise<void>;
        onNeeded(cb: (payload: { reason: 'screen' }) => void): () => void;
        onStatus(
          cb: (payload: { screen: ScreenPermissionStatus; probeError?: boolean }) => void,
        ): () => void;
      };
      capture: {
        onSaved(cb: (payload: { path: string }) => void): () => void;
        onError(
          cb: (payload: { message: string; recoverable: boolean }) => void,
        ): () => void;
      };
      settings: {
        pickSaveDir(): Promise<string | null>;
      };
      shell: {
        openPath(p: string): Promise<void>;
      };
      ai: {
        setKey(provider: ProviderId, key: string): Promise<void>;
        deleteKey(provider: ProviderId): Promise<void>;
        getStatus(): Promise<AiStatus[]>;
        testConnection(
          provider: ProviderId,
          model: string,
        ): Promise<ConnectionTestResult>;
        ask(input: AskInput): Promise<{ requestId: string }>;
        cancel(requestId: string): Promise<void>;
        onChunk(cb: (c: StreamChunk) => void): () => void;
        recognize(payload: {
          png: Uint8Array;
          mime?: string;
          profile?: ProfileId;
        }): Promise<{ text: string; error?: string }>;
        autocorrect(payload: {
          text: string;
          profile?: ProfileId;
        }): Promise<{ text: string; error?: string }>;
      };
      ollama: {
        status(): Promise<OllamaServiceStatus>;
        start(): Promise<OllamaServiceStatus>;
        listModels(): Promise<LocalModelInfo[]>;
        diskSpace(): Promise<number>;
        pull(model: string): Promise<{ ok: boolean }>;
        cancelPull(model: string): Promise<void>;
        deleteModel(model: string): Promise<void>;
        installHelp(): Promise<void>;
        onPullProgress(cb: (p: OllamaPullProgress) => void): () => void;
      };
      rag: {
        stats(): Promise<Record<ProfileId, number>>;
        resetProfile(profile: ProfileId): Promise<void>;
        capture(payload: {
          profile: ProfileId;
          kind: 'typed' | 'drawn' | 'analysis' | 'chat';
          original: string;
          corrected: string;
        }): Promise<void>;
      };
      chat: {
        start(payload: {
          png: Uint8Array;
          mime: string;
          profile: ProfileId;
        }): Promise<{ sessionId: string }>;
        startText(payload: { text: string; profile: ProfileId }): Promise<{ sessionId: string }>;
        onSession(cb: (s: ChatSessionPayload) => void): () => void;
      };
      app: {
        info(): Promise<{ name: string; version: string; packaged: boolean }>;
        relaunch(): Promise<void>;
      };
      updater: {
        get(): Promise<UpdateStatus>;
        check(): Promise<UpdateStatus>;
        install(): Promise<void>;
        openReleases(): Promise<void>;
        onStatus(cb: (s: UpdateStatus) => void): () => void;
      };
      env: {
        displayId(): number;
      };
    };
  }
}

export {};
