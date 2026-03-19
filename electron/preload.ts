import { contextBridge } from 'electron';

// Expose minimal, safe API to renderer
contextBridge.exposeInMainWorld('polarChat', {
  platform: process.platform,
  isElectron: true,
});
