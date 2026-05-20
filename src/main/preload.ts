import { contextBridge, ipcRenderer } from 'electron';
import type { HubStateUpdate, IpcChannel } from '../shared/types';

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
    onScreenshot: (cb: (payload: { dataUrl: string }) => void) =>
      bind('overlay:screenshot', cb as (v: unknown) => void),
    onSnip: (
      cb: (payload: {
        dataUrl: string;
        rect: { x: number; y: number; w: number; h: number };
        scaleFactor: number;
      }) => void,
    ) => bind('overlay:snip', cb as (v: unknown) => void),
    onSnipSelection: (
      cb: (rect: { x: number; y: number; w: number; h: number } | null) => void,
    ) => bind('overlay:snip-selection', cb as (v: unknown) => void),
    requestFocus: () => ipcRenderer.invoke('overlay:request-focus' satisfies IpcChannel),
    releaseFocus: () => ipcRenderer.invoke('overlay:release-focus' satisfies IpcChannel),
    sendScreenshotResult: (pngBase64: string) =>
      ipcRenderer.invoke('capture:screenshot:result' satisfies IpcChannel, pngBase64),
    sendSnipResult: (pngBase64: string) =>
      ipcRenderer.invoke('capture:snip:result' satisfies IpcChannel, pngBase64),
  },
  snip: {
    set: (payload: {
      rect: { x: number; y: number; w: number; h: number };
      displayId: number;
    }) => ipcRenderer.invoke('snip:set' satisfies IpcChannel, payload),
    clear: (payload: { displayId: number }) =>
      ipcRenderer.invoke('snip:clear' satisfies IpcChannel, payload),
    copy: () => ipcRenderer.invoke('snip:copy' satisfies IpcChannel),
  },
  relay: {
    undo: () => ipcRenderer.invoke('relay:undo' satisfies IpcChannel),
    redo: () => ipcRenderer.invoke('relay:redo' satisfies IpcChannel),
    clear: () => ipcRenderer.invoke('relay:clear' satisfies IpcChannel),
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
    open: (which: 'screen' | 'accessibility') =>
      ipcRenderer.invoke('permissions:open' satisfies IpcChannel, which),
  },
  app: {
    info: () =>
      ipcRenderer.invoke('app:info' satisfies IpcChannel) as Promise<{
        name: string;
        version: string;
      }>,
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
