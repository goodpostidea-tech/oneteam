const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_e, info) => cb(info)),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_e, progress) => cb(progress)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_e, info) => cb(info)),
  installUpdate: () => ipcRenderer.send('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
});
