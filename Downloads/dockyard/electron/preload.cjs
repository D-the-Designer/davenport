const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dockyard', {
  getDocks:          ()         => ipcRenderer.invoke('get-docks'),
  getAssets:         (dockId)   => ipcRenderer.invoke('get-assets', dockId),
  upsertDock:        (dock)     => ipcRenderer.invoke('upsert-dock', dock),
  upsertAsset:       (asset)    => ipcRenderer.invoke('upsert-asset', asset),
  deleteDock:        (id)       => ipcRenderer.invoke('delete-dock', id),
  deleteAsset:       (id)       => ipcRenderer.invoke('delete-asset', id),
  importFiles:       ()         => ipcRenderer.invoke('import-files'),
  openFile:          (path)     => ipcRenderer.invoke('open-file', path),
  getDataDir:        ()         => ipcRenderer.invoke('get-data-dir'),
  toggleAlwaysOnTop: ()         => ipcRenderer.invoke('toggle-always-on-top'),
  exportDock:        (data)     => ipcRenderer.invoke('export-dock', data),
});
