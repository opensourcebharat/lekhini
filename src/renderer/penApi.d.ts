import type { HubStateUpdate, ScreenPermissionStatus } from '../shared/types';

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
        onScreenshot(cb: (payload: { dataUrl: string }) => void): () => void;
        onSnip(
          cb: (payload: {
            dataUrl: string;
            rect: { x: number; y: number; w: number; h: number };
            scaleFactor: number;
          }) => void,
        ): () => void;
        onSnipSelection(
          cb: (rect: { x: number; y: number; w: number; h: number } | null) => void,
        ): () => void;
        requestFocus(): Promise<void>;
        releaseFocus(): Promise<void>;
        sendScreenshotResult(pngBase64: string): Promise<void>;
        sendSnipResult(pngBase64: string): Promise<void>;
      };
      snip: {
        set(payload: {
          rect: { x: number; y: number; w: number; h: number };
          displayId: number;
        }): Promise<void>;
        clear(payload: { displayId: number }): Promise<void>;
        copy(): Promise<void>;
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
        open(which: 'screen' | 'accessibility'): Promise<void>;
        onNeeded(cb: (payload: { reason: 'screen' }) => void): () => void;
        onStatus(cb: (payload: { screen: ScreenPermissionStatus }) => void): () => void;
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
      app: {
        info(): Promise<{ name: string; version: string }>;
      };
      env: {
        displayId(): number;
      };
    };
  }
}

export {};
