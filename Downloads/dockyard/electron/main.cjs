const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

nativeTheme.themeSource = 'dark';
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

const DOCKYARD_DIR = path.join(os.homedir(), 'Dockyard');
const ASSETS_DIR   = path.join(DOCKYARD_DIR, 'assets');
const EXPORTS_DIR  = path.join(DOCKYARD_DIR, 'exports');
[DOCKYARD_DIR, ASSETS_DIR, EXPORTS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

let db = null;
try {
  const Database = require('better-sqlite3');
  db = new Database(path.join(DOCKYARD_DIR, 'dockyard.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS docks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      accent TEXT DEFAULT '#4AFC6A',
      icon TEXT DEFAULT '⬡',
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      dock_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      file_path TEXT DEFAULT '',
      title TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      source TEXT DEFAULT '',
      license TEXT DEFAULT '',
      prompt_text TEXT DEFAULT '',
      color TEXT DEFAULT '',
      size TEXT DEFAULT '',
      dimensions TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(dock_id) REFERENCES docks(id) ON DELETE CASCADE
    );
  `);
} catch(e) {
  console.warn('SQLite not available, memory mode:', e.message);
}

function getDocks() {
  if (!db) return [];
  return db.prepare('SELECT * FROM docks ORDER BY created_at ASC').all()
    .map(d => ({ ...d, tags: JSON.parse(d.tags||'[]') }));
}
function getAssets(dockId) {
  if (!db) return [];
  return db.prepare('SELECT * FROM assets WHERE dock_id=? ORDER BY created_at ASC').all(dockId)
    .map(a => ({ ...a, tags: JSON.parse(a.tags||'[]'), dockId: a.dock_id }));
}
function upsertDock(dock) {
  if (!db) return;
  db.prepare(`INSERT OR REPLACE INTO docks(id,name,description,accent,icon,tags,created_at,updated_at)
    VALUES(@id,@name,@description,@accent,@icon,@tags,
      COALESCE((SELECT created_at FROM docks WHERE id=@id),datetime('now')),datetime('now'))`)
    .run({...dock, tags: JSON.stringify(dock.tags||[])});
}
function upsertAsset(asset) {
  if (!db) return;
  db.prepare(`INSERT OR REPLACE INTO assets(id,dock_id,type,file_path,title,tags,notes,source,license,prompt_text,color,size,dimensions,created_at,updated_at)
    VALUES(@id,@dock_id,@type,@file_path,@title,@tags,@notes,@source,@license,@prompt_text,@color,@size,@dimensions,
      COALESCE((SELECT created_at FROM assets WHERE id=@id),datetime('now')),datetime('now'))`)
    .run({...asset, dock_id: asset.dockId, tags: JSON.stringify(asset.tags||[])});
}
function deleteDock(id) { if(db) db.prepare('DELETE FROM docks WHERE id=?').run(id); }
function deleteAsset(id) { if(db) db.prepare('DELETE FROM assets WHERE id=?').run(id); }

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 500,
    backgroundColor: '#080C09',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('get-docks', () => getDocks());
ipcMain.handle('get-assets', (_, dockId) => getAssets(dockId));
ipcMain.handle('upsert-dock', (_, dock) => { upsertDock(dock); return getDocks(); });
ipcMain.handle('upsert-asset', (_, asset) => { upsertAsset(asset); return true; });
ipcMain.handle('delete-dock', (_, id) => { deleteDock(id); return getDocks(); });
ipcMain.handle('delete-asset', (_, id) => { deleteAsset(id); return true; });
ipcMain.handle('get-data-dir', () => DOCKYARD_DIR);

ipcMain.handle('import-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile','multiSelections'],
    filters: [
      { name: 'All Supported', extensions: ['png','jpg','jpeg','webp','gif','svg','mp4','mov','mp3','wav','aiff','ogg','m4a','txt','md','pdf'] },
      { name: 'Images', extensions: ['png','jpg','jpeg','webp','gif','svg'] },
      { name: 'Audio', extensions: ['mp3','wav','aiff','ogg','m4a'] },
      { name: 'Documents', extensions: ['txt','md','pdf'] },
    ]
  });
  if (result.canceled) return [];
  return result.filePaths.map(fp => {
    const stat = fs.statSync(fp);
    const ext = path.extname(fp).toLowerCase().replace('.','');
    let type = 'other';
    if (['png','jpg','jpeg','webp','gif'].includes(ext)) type = 'image';
    else if (ext === 'svg') type = 'vector';
    else if (['mp3','wav','aiff','ogg','m4a'].includes(ext)) type = 'audio';
    else if (['mp4','mov'].includes(ext)) type = 'video';
    else if (['txt','md','pdf'].includes(ext)) type = 'document';
    const destName = `${Date.now()}-${path.basename(fp)}`;
    const destPath = path.join(ASSETS_DIR, destName);
    try { fs.copyFileSync(fp, destPath); } catch(e) {}
    return {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      title: path.basename(fp),
      file_path: destPath,
      type, size: `${(stat.size/1024/1024).toFixed(1)} MB`,
      tags: [], notes: '', source: 'Imported', license: '',
      prompt_text: '', color: '', dimensions: '—',
    };
  });
});

ipcMain.handle('open-file', (_, filePath) => {
  if (filePath && fs.existsSync(filePath)) shell.openPath(filePath);
});

ipcMain.handle('toggle-always-on-top', () => {
  const next = !mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(next, 'floating');
  return next;
});

ipcMain.handle('export-dock', async (_, { dock, assets }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(EXPORTS_DIR, `${dock.name.replace(/\s+/g,'-')}.dockyard.zip`),
    filters: [{ name: 'Dockyard Package', extensions: ['zip'] }]
  });
  if (result.canceled) return false;
  const manifest = JSON.stringify({ dock, assets, exported_at: new Date().toISOString() }, null, 2);
  fs.writeFileSync(result.filePath.replace(/\.zip$/,'') + '-manifest.json', manifest);
  return true;
});
