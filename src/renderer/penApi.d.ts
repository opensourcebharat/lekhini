import type {
  AiStatus,
  AskInput,
  ChatSessionPayload,
  ConnectionTestResult,
  HubStateUpdate,
  ProfileId,
  ProviderId,
  ScreenPermissionStatus,
  StreamChunk,
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
      };
      chat: {
        start(payload: {
          png: Uint8Array;
          mime: string;
          profile: ProfileId;
        }): Promise<{ sessionId: string }>;
        onSession(cb: (s: ChatSessionPayload) => void): () => void;
      };
      app: {
        info(): Promise<{ name: string; version: string; packaged: boolean }>;
        relaunch(): Promise<void>;
      };
      env: {
        displayId(): number;
      };
    };
  }
}

export {};
