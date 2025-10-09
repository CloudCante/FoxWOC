const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadApprovedSerials: () => ipcRenderer.invoke('load-approved-serials'),
  readTemplateFile:() => ipcRenderer.invoke('load-output-template'),
});
