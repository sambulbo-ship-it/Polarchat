import { contextBridge, ipcRenderer } from 'electron';

// Expose minimal, safe API to renderer process
contextBridge.exposeInMainWorld('polarChat', {
  platform: process.platform,
  isElectron: true,
  arch: process.arch,

  // Window controls (for custom titlebar on Windows)
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },

  // App info
  getVersion: () => ipcRenderer.invoke('app:version'),

  // Notification support (native OS notifications)
  notify: (title: string, body: string) => {
    ipcRenderer.send('app:notify', { title, body });
  },
});

// Type declarations for the renderer
export interface PolarChatAPI {
  platform: NodeJS.Platform;
  isElectron: boolean;
  arch: string;
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  getVersion: () => Promise<string>;
  notify: (title: string, body: string) => void;
}

declare global {
  interface Window {
    polarChat?: PolarChatAPI;
  }
}
