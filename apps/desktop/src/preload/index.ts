import { contextBridge } from 'electron';

// Stub: the typed IPC surface between renderer and main will be exposed here.
contextBridge.exposeInMainWorld('forma', {
  platform: process.platform,
});
