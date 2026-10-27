const { contextBridge, ipcRenderer } = require('electron');

/**
 * Minimal, explicitly enumerated bridge between the renderer and the desktop
 * shell. The renderer itself has no Node.js access (sandboxed, no nodeIntegration).
 */
contextBridge.exposeInMainWorld('umlDesktop', {
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  openFile: () => ipcRenderer.invoke('file:open'),
  copyImage: (pngData) => ipcRenderer.invoke('clipboard:image', pngData),
  copyText: (text) => ipcRenderer.invoke('clipboard:text', text),
  setTheme: (theme) => ipcRenderer.invoke('window:theme', theme),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  getInfo: () => ipcRenderer.invoke('app:info'),
});
