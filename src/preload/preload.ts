import { contextBridge, ipcRenderer } from 'electron';
import type { IpcInvokeMap, AppSnapshot } from '../shared/ipc-contract';

const allusApi = {
  invoke<K extends keyof IpcInvokeMap>(
    channel: K,
    args: Parameters<IpcInvokeMap[K]>[0],
  ): Promise<ReturnType<IpcInvokeMap[K]>> {
    return ipcRenderer.invoke(channel, args);
  },
  onState(callback: (snapshot: AppSnapshot) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) => callback(snapshot);
    ipcRenderer.on('state:update', listener);
    return () => ipcRenderer.removeListener('state:update', listener);
  },
  on(channel: string, callback: () => void): () => void {
    const listener = () => callback();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

export type AllusApi = typeof allusApi;

contextBridge.exposeInMainWorld('allus', allusApi);
