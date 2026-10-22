import { contextBridge, ipcRenderer } from 'electron';

// The whole surface between renderer and main: no generic channel access.
contextBridge.exposeInMainWorld('forma', {
  platform: process.platform,
  /** Native folder picker; resolves to the chosen path, or `null` if cancelled. */
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('forma:pick-folder'),
});
