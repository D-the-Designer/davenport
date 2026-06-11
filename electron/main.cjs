const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

nativeTheme.themeSource = 'dark';

// Must be called before app is ready
const { protocol } = require('electron');
protocol.registerSchemesAsPrivileged([
  { scheme: 'davenport-files', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
]);
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// ── DATA ROOT (configurable) ──────────────────────────────────────────────
// Config lives in Electron userData; data root defaults to ~/Davenport.
// The SQLite DB lives INSIDE the data root, so switching roots switches
// libraries. Existing assets keep absolute file_path and remain readable.
const CONFIG_PATH = path.join(app.getPath('userData'), 'davenport-config.json');
const loadConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch(e) { return {}; } };
const saveConfig = (c) => { try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2)); } catch(e) { console.error('[CONFIG]', e.message); } };

let DAVENPORT_DIR, ASSETS_DIR, THUMBS_DIR, EXPORTS_DIR;
let db = null;

function openDatabase() {
  try {
    if (db) { try { db.close(); } catch(e) {} db = null; }
    const Database = require('better-sqlite3');
    db = new Database(path.join(DAVENPORT_DIR, 'davenport-files.db'));
    db.pragma('journal_mode = WAL');
    db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
      client TEXT DEFAULT '', scope TEXT DEFAULT '', deliverables TEXT DEFAULT '',
      deadline TEXT DEFAULT '', status TEXT DEFAULT 'active', notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS containers (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_id TEXT DEFAULT NULL,
      name TEXT NOT NULL, notes TEXT DEFAULT '', sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, container_id TEXT NOT NULL, project_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other', file_path TEXT DEFAULT '', thumb_path TEXT DEFAULT '',
      title TEXT NOT NULL, original_name TEXT DEFAULT '', sequence_num INTEGER DEFAULT 1,
      tags TEXT DEFAULT '[]', notes TEXT DEFAULT '', source TEXT DEFAULT '',
      license TEXT DEFAULT '', prompt_text TEXT DEFAULT '', color TEXT DEFAULT '',
      size TEXT DEFAULT '', dimensions TEXT DEFAULT '', duration TEXT DEFAULT '',
      state TEXT DEFAULT 'raw',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(container_id) REFERENCES containers(id) ON DELETE CASCADE
    );
    `);
    // MIGRATION: original_path (full source path at import time)
    const assetCols = db.prepare(`PRAGMA table_info(assets)`).all().map(c => c.name);
    if (!assetCols.includes('original_path')) {
      db.exec(`ALTER TABLE assets ADD COLUMN original_path TEXT DEFAULT ''`);
      console.log('[MIGRATION] assets.original_path added');
    }
  } catch(e) { console.warn('[ELECTRON] SQLite memory mode:', e.message); }
}

function setDataRoot(root) {
  DAVENPORT_DIR = root;
  ASSETS_DIR   = path.join(root, 'assets');
  THUMBS_DIR   = path.join(root, 'thumbnails');
  EXPORTS_DIR  = path.join(root, 'exports');
  [DAVENPORT_DIR, ASSETS_DIR, THUMBS_DIR, EXPORTS_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
  openDatabase();
  console.log('[DATA ROOT]', DAVENPORT_DIR);
}

setDataRoot(loadConfig().dataDir || path.join(os.homedir(), 'Davenport'));

const q   = (sql, ...a) => { try { return db ? db.prepare(sql).all(...a) : []; } catch(e) { return []; } };
const run = (sql, ...a) => { try { if (db) db.prepare(sql).run(...a); } catch(e) { console.error(e.message); } };
const g1  = (sql, ...a) => { try { return db ? db.prepare(sql).get(...a) : null; } catch(e) { return null; } };

const getProjects    = ()  => q('SELECT * FROM projects ORDER BY created_at ASC');
const getContainers  = (pid) => q('SELECT * FROM containers WHERE project_id=? ORDER BY sort_order ASC, created_at ASC', pid);
const getAssets      = (cid) => q('SELECT * FROM assets WHERE container_id=? ORDER BY sequence_num ASC, created_at ASC', cid).map(a=>({...a,tags:JSON.parse(a.tags||'[]')}));
const nextSeq        = (cid) => { const r=g1('SELECT MAX(sequence_num) as m FROM assets WHERE container_id=?',cid); return (r?.m||0)+1; };
const safeName       = (s)   => s.replace(/[^a-zA-Z0-9\-_]/g,'-').replace(/-+/g,'-').slice(0,40);

// ── REAL DIRECTORY LAYOUT ─────────────────────────────────────────────────
// Davenport rule #1: the container tree IS the directory tree.
// ~/Davenport/[Project]/[Container]/[Nested]/file.ext — visible in Finder.
const dirName = (s) => String(s||'').replace(/[\/:\\]/g,'-').trim() || 'Untitled';
const RESERVED_DIRS = new Set(['assets','thumbnails','exports']);
function projectDirPath(projectId) {
  const p = g1('SELECT * FROM projects WHERE id=?', projectId);
  if (!p) return null;
  let n = dirName(p.name);
  if (RESERVED_DIRS.has(n.toLowerCase())) n = `${n}-project`;
  return path.join(DAVENPORT_DIR, n);
}
function containerDirPath(containerId) {
  let c = g1('SELECT * FROM containers WHERE id=?', containerId);
  if (!c) return null;
  const projectId = c.project_id;
  const segs = [];
  while (c) { segs.unshift(dirName(c.name)); c = c.parent_id ? g1('SELECT * FROM containers WHERE id=?', c.parent_id) : null; }
  const pd = projectDirPath(projectId);
  return pd ? path.join(pd, ...segs) : null;
}
function ensureDir(d) { try { if (d && !fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); return d; } catch(e) { console.error('[DIR]', e.message); return null; } }

// One-time (idempotent) migration: any asset still living flat in assets/
// moves into its container's real directory. Failures leave the file and DB
// row untouched. Runs at startup and after data-root switches.
function migrateFlatAssets() {
  try {
    if (!db) return;
    const rows = q('SELECT id, file_path, container_id FROM assets');
    let moved = 0, failed = 0;
    for (const r of rows) {
      if (!r.file_path || !r.file_path.startsWith(ASSETS_DIR + path.sep)) continue;
      if (!fs.existsSync(r.file_path)) continue;
      try {
        const destDir = ensureDir(containerDirPath(r.container_id));
        if (!destDir) continue;
        let dest = path.join(destDir, path.basename(r.file_path));
        let i = 1;
        while (fs.existsSync(dest)) {
          const e = path.extname(r.file_path); const b = path.basename(r.file_path, e);
          dest = path.join(destDir, `${b}-${i++}${e}`);
        }
        fs.renameSync(r.file_path, dest);
        run('UPDATE assets SET file_path=? WHERE id=?', dest, r.id);
        moved++;
      } catch(e) { failed++; console.error('[MIGRATE]', r.id, e.message); }
    }
    if (moved || failed) console.log(`[MIGRATE] real-directory layout: ${moved} moved, ${failed} failed`);
  } catch(e) { console.error('[MIGRATE]', e.message); }
}
migrateFlatAssets();

async function generateThumb(src, dest, type) {
  if (!['image','vector'].includes(type)) return false;
  try {
    const sharp = require('sharp');
    await sharp(src)
      .resize(200, 200, { fit: 'cover', position: 'centre' })
      .png()
      .toFile(dest);
    console.log('[THUMB] Generated:', dest);
    return true;
  } catch(e) {
    console.warn('[THUMB] Sharp failed, trying nativeImage fallback:', e.message);
    try {
      const { nativeImage } = require('electron');
      const img = nativeImage.createFromPath(src);
      if (!img.isEmpty()) {
        const resized = img.resize({ width: 200, height: 200 });
        const pngData = resized.toPNG();
        fs.writeFileSync(dest, pngData);
        console.log('[THUMB] nativeImage fallback success:', dest);
        return true;
      }
    } catch(e2) {
      console.warn('[THUMB] nativeImage fallback failed:', e2.message);
    }
  }
  return false;
}

function detectType(ext) {
  const e = ext.toLowerCase().replace('.','');
  if (['png','jpg','jpeg','gif','webp','tiff','heic','bmp'].includes(e)) return 'image';
  if (['svg'].includes(e)) return 'vector';
  if (['mp4','mov','webm','avi'].includes(e)) return 'video';
  if (['mp3','wav','aiff','ogg','m4a','flac','aif'].includes(e)) return 'audio';
  if (['otf','ttf','woff','woff2'].includes(e)) return 'font';
  if (['pdf','docx','txt','md','rtf'].includes(e)) return 'document';
  if (['json','yaml','yml','js','ts','css','glsl','py','sh'].includes(e)) return 'code';
  if (['cube'].includes(e)) return 'lut';
  if (['ase'].includes(e)) return 'color';
  return 'other';
}

async function importFile(filePath, containerId, projectId, containerName) {
  const stat = fs.statSync(filePath);
  const origExt = path.extname(filePath).toLowerCase();
  const type = detectType(origExt);
  let seq = nextSeq(containerId);
  const sName = safeName(containerName);
  let finalExt = origExt, srcForCopy = filePath;
  if (origExt === '.webp') {
    try {
      const sharp = require('sharp');
      const tmp = path.join(ASSETS_DIR, `_tmp_${Date.now()}.png`);
      await sharp(filePath).png().toFile(tmp);
      srcForCopy = tmp; finalExt = '.png';
    } catch(e) {}
  }
  const assetId = `asset-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const destDir = ensureDir(containerDirPath(containerId)) || ASSETS_DIR;
  let newName, destPath;
  for (;;) {
    newName = `${sName}_${String(seq).padStart(3,'0')}${finalExt}`;
    destPath = path.join(destDir, newName);
    if (!fs.existsSync(destPath)) break;
    seq++;
  }
  fs.copyFileSync(srcForCopy, destPath);
  if (srcForCopy !== filePath && fs.existsSync(srcForCopy)) fs.unlinkSync(srcForCopy);
  const thumbPath = path.join(THUMBS_DIR, `${assetId}_thumb.png`);
  await generateThumb(destPath, thumbPath, type);
  const asset = {
    id: assetId, container_id: containerId, project_id: projectId, type,
    file_path: destPath, thumb_path: fs.existsSync(thumbPath) ? thumbPath : '',
    title: newName, original_name: path.basename(filePath), original_path: filePath, sequence_num: seq,
    tags: '[]', notes: '', source: 'Imported', license: '', prompt_text: '',
    color: '', size: `${(stat.size/1024/1024).toFixed(1)} MB`, dimensions: '—', duration: '', state: 'raw',
  };
  run(`INSERT OR REPLACE INTO assets(id,container_id,project_id,type,file_path,thumb_path,title,original_name,original_path,sequence_num,tags,notes,source,license,prompt_text,color,size,dimensions,duration,state)
    VALUES(@id,@container_id,@project_id,@type,@file_path,@thumb_path,@title,@original_name,@original_path,@sequence_num,@tags,@notes,@source,@license,@prompt_text,@color,@size,@dimensions,@duration,@state)`, asset);
  return { ...asset, tags: [] };
}

let mainWindow;
let notesWindow = null;
let alwaysOnTop = false;

function openNotesWindow() {
  const { spawn } = require('child_process');
  const electronBin = process.execPath;
  const notesMain   = path.join(__dirname, 'notes-main.cjs');
  const child = spawn(electronBin, [notesMain], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env }
  });
  child.unref();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 200, minHeight: 300,
    backgroundColor: '#080C09',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,  // Allow file:// access for local thumbnails
    },
    show: false,
  });
  if (isDev) { mainWindow.loadURL('http://localhost:5173'); }
  else { mainWindow.loadFile(path.join(__dirname, '../dist/index.html')); }
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Allow loading local file:// images for thumbnails
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' 'unsafe-eval' file: data: blob:"]
      }
    });
  });
}

app.whenReady().then(() => {
  // Register file protocol for local thumbnails and assets
  protocol.registerFileProtocol('davenport-files', (request, callback) => {
    try {
      const url = request.url.replace('davenport-files://', '');
      const filePath = decodeURIComponent(url);
      callback({ path: filePath });
    } catch(e) {
      console.error('[PROTOCOL] Error:', e);
      callback({ error: -2 });
    }
  });
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('open-notes-window', () => { openNotesWindow(); });

ipcMain.handle('get-projects', () => getProjects());
ipcMain.handle('upsert-project', (_, p) => {
  const old = g1('SELECT * FROM projects WHERE id=?', p.id);
  const oldDir = old ? projectDirPath(p.id) : null;
  run(`INSERT OR REPLACE INTO projects(id,name,description,client,scope,deliverables,deadline,status,notes,created_at,updated_at)
    VALUES(@id,@name,@description,@client,@scope,@deliverables,@deadline,@status,@notes,COALESCE((SELECT created_at FROM projects WHERE id=@id),datetime('now')),datetime('now'))`, p);
  const newDir = projectDirPath(p.id);
  try {
    if (oldDir && newDir && oldDir !== newDir && fs.existsSync(oldDir)) {
      fs.renameSync(oldDir, newDir);
      const affected = q('SELECT id,file_path FROM assets WHERE file_path LIKE ?', oldDir + path.sep + '%');
      for (const a of affected) run('UPDATE assets SET file_path=? WHERE id=?', newDir + a.file_path.slice(oldDir.length), a.id);
    } else ensureDir(newDir);
  } catch(e) { console.error('[PROJECT DIR]', e.message); }
  return getProjects();
});
ipcMain.handle('delete-project', async (_, id) => {
  const dir = projectDirPath(id);
  run('DELETE FROM projects WHERE id=?', id);
  try { if (dir && fs.existsSync(dir)) await shell.trashItem(dir); } catch(e) { console.error('[PROJECT DIR]', e.message); }
  return getProjects();
});

ipcMain.handle('get-containers', (_, pid) => getContainers(pid));
ipcMain.handle('upsert-container', (_, c) => {
  const old = g1('SELECT * FROM containers WHERE id=?', c.id);
  const oldDir = old ? containerDirPath(c.id) : null;
  run(`INSERT OR REPLACE INTO containers(id,project_id,parent_id,name,notes,sort_order,created_at,updated_at)
    VALUES(@id,@project_id,@parent_id,@name,@notes,@sort_order,COALESCE((SELECT created_at FROM containers WHERE id=@id),datetime('now')),datetime('now'))`, c);
  const newDir = containerDirPath(c.id);
  try {
    if (oldDir && newDir && oldDir !== newDir && fs.existsSync(oldDir)) {
      fs.renameSync(oldDir, newDir);
      const affected = q('SELECT id,file_path FROM assets WHERE file_path LIKE ?', oldDir + path.sep + '%');
      for (const a of affected) run('UPDATE assets SET file_path=? WHERE id=?', newDir + a.file_path.slice(oldDir.length), a.id);
    } else ensureDir(newDir);
  } catch(e) { console.error('[CONTAINER DIR]', e.message); }
  return getContainers(c.project_id);
});
ipcMain.handle('delete-container', async (_, { id, projectId }) => {
  const dir = containerDirPath(id);
  run('DELETE FROM containers WHERE id=?', id);
  try { if (dir && fs.existsSync(dir)) await shell.trashItem(dir); } catch(e) { console.error('[CONTAINER DIR]', e.message); }
  return getContainers(projectId);
});

ipcMain.handle('get-assets', (_, cid) => getAssets(cid));
ipcMain.handle('upsert-asset', (_, a) => {
  run(`INSERT OR REPLACE INTO assets(id,container_id,project_id,type,file_path,thumb_path,title,original_name,sequence_num,tags,notes,source,license,prompt_text,color,size,dimensions,duration,state,created_at,updated_at)
    VALUES(@id,@container_id,@project_id,@type,@file_path,@thumb_path,@title,@original_name,@sequence_num,@tags,@notes,@source,@license,@prompt_text,@color,@size,@dimensions,@duration,@state,
    COALESCE((SELECT created_at FROM assets WHERE id=@id),datetime('now')),datetime('now'))`,
    { ...a, tags: JSON.stringify(a.tags||[]) });
  return true;
});
ipcMain.handle('delete-asset', (_, id) => { run('DELETE FROM assets WHERE id=?', id); return true; });
ipcMain.handle('set-asset-state', (_, { id, state }) => { run("UPDATE assets SET state=?,updated_at=datetime('now') WHERE id=?", state, id); return true; });

ipcMain.handle('import-files-dialog', async (_, { containerId, projectId, containerName }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile','multiSelections'],
    filters: [{ name: 'All Supported', extensions: ['png','jpg','jpeg','webp','gif','svg','tiff','heic','mp4','mov','webm','mp3','wav','aiff','ogg','m4a','flac','pdf','docx','txt','md','otf','ttf','json','yaml','css','cube','ase'] }]
  });
  if (result.canceled || !result.filePaths.length) return [];
  const imported = [];
  for (const fp of result.filePaths) {
    try { imported.push(await importFile(fp, containerId, projectId, containerName)); }
    catch(e) { console.error('[IMPORT] Failed:', fp, e.message); }
  }
  return imported;
});

ipcMain.handle('import-dropped-files', async (_, { filePaths, containerId, projectId, containerName }) => {
  const imported = [];
  for (const fp of filePaths) {
    if (!fs.existsSync(fp)) continue;
    try { imported.push(await importFile(fp, containerId, projectId, containerName)); }
    catch(e) { console.error('[IMPORT] Failed:', fp, e.message); }
  }
  return imported;
});

// TRASH ORIGINALS — macOS Trash via shell.trashItem, never fs.unlink.
// Only called by renderer AFTER import succeeds and user confirms.
ipcMain.handle('trash-originals', async (_, paths) => {
  const result = { trashed: [], skipped: [] };
  for (const p of paths || []) {
    try {
      await shell.trashItem(p);
      result.trashed.push(p);
    } catch(e) {
      result.skipped.push({ path: p, reason: e.message || 'UNKNOWN' });
    }
  }
  console.log('[TRASH]', result.trashed.length, 'trashed,', result.skipped.length, 'skipped');
  return result;
});

// SET DATA FOLDER — choose where the Davenport library lives. The DB sits
// inside the chosen folder, so picking a folder with an existing
// davenport-files.db opens that library; picking an empty one starts fresh.
ipcMain.handle('choose-data-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Davenport Data Folder',
    buttonLabel: 'Use This Folder',
    defaultPath: DAVENPORT_DIR,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const root = result.filePaths[0];
  setDataRoot(root);
  migrateFlatAssets();
  const cfg = loadConfig(); cfg.dataDir = root; saveConfig(cfg);
  return root;
});

// IMPORT FOLDER — browse to any folder; it becomes a container (under the
// current container if one is active), subfolders become nested containers,
// files import with the standard rename convention. Dotfiles skipped.
ipcMain.handle('import-folder-dialog', async (_, { projectId, parentContainerId }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Folder',
    buttonLabel: 'Import',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const rootDir = result.filePaths[0];
  const imported = [];
  async function walk(dir, parentId) {
    const name = path.basename(dir);
    const cid = `cont-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    run('INSERT INTO containers(id,project_id,parent_id,name,notes,sort_order) VALUES(?,?,?,?,?,0)', cid, projectId, parentId, name, '');
    ensureDir(containerDirPath(cid));
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full, cid);
      } else if (ent.isFile()) {
        try { imported.push(await importFile(full, cid, projectId, name)); }
        catch(e) { console.error('[IMPORT-FOLDER] Failed:', full, e.message); }
      }
    }
  }
  await walk(rootDir, parentContainerId || null);
  return { containers: getContainers(projectId), imported };
});

// STAGE FOR DRAG — copy selected assets into a timestamped staging folder and
// open it in Finder. Guaranteed multi-file route into any app regardless of
// Electron's drag-out limitations: drag the group from the Finder window.
ipcMain.handle('stage-files', async (_, { filePaths }) => {
  try {
    const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    const stageDir = path.join(EXPORTS_DIR, `stage-${stamp}`);
    fs.mkdirSync(stageDir, { recursive: true });
    let n = 0;
    for (const fp of filePaths || []) {
      if (fp && fs.existsSync(fp)) {
        fs.copyFileSync(fp, path.join(stageDir, path.basename(fp)));
        n++;
      }
    }
    if (n > 0) await shell.openPath(stageDir);
    return { staged: n, dir: stageDir };
  } catch(e) {
    console.error('[STAGE]', e.message);
    return { staged: 0, dir: null };
  }
});

// MOVE ASSETS — reassign to a target container, re-deriving filename/title
// from the destination's naming convention (container_NNN.ext). Provenance
// fields (original_name, original_path) are preserved untouched.
function moveAssetsCore(assetIds, targetContainerId) {
  const target = g1('SELECT * FROM containers WHERE id=?', targetContainerId);
  if (!target) return { moved: 0 };
  const sName = safeName(target.name);
  let moved = 0;
  for (const id of assetIds || []) {
    const a = g1('SELECT * FROM assets WHERE id=?', id);
    if (!a || a.container_id === targetContainerId) continue;
    try {
      let seq = nextSeq(targetContainerId);
      const ext = path.extname(a.file_path || a.title || '') || '';
      let newName, newPath;
      const dir = ensureDir(containerDirPath(targetContainerId)) || (a.file_path ? path.dirname(a.file_path) : ASSETS_DIR);
      // bump seq past any physical name collision
      for (;;) {
        newName = `${sName}_${String(seq).padStart(3,'0')}${ext}`;
        newPath = path.join(dir, newName);
        if (newPath === a.file_path || !fs.existsSync(newPath)) break;
        seq++;
      }
      if (a.file_path && fs.existsSync(a.file_path) && newPath !== a.file_path) {
        fs.renameSync(a.file_path, newPath);
      }
      run(`UPDATE assets SET container_id=?, title=?, sequence_num=?, file_path=?, updated_at=datetime('now') WHERE id=?`,
        targetContainerId, newName, seq, newPath, id);
      moved++;
    } catch(e) { console.error('[MOVE] Failed:', id, e.message); }
  }
  return { moved };
}

ipcMain.handle('move-assets', (_, { assetIds, targetContainerId }) =>
  moveAssetsCore(assetIds, targetContainerId));

// MOVE OR IMPORT — drop onto a sidebar folder. Paths matching existing
// project assets are MOVED; unknown paths are IMPORTED into that folder.
ipcMain.handle('move-or-import', async (_, { filePaths, targetContainerId, projectId }) => {
  const target = g1('SELECT * FROM containers WHERE id=?', targetContainerId);
  if (!target) return null;
  const moveIds = [], importPaths = [];
  for (const p of filePaths || []) {
    const existing = g1('SELECT id FROM assets WHERE file_path=? AND project_id=?', p, projectId);
    if (existing) moveIds.push(existing.id); else importPaths.push(p);
  }
  const { moved } = moveAssetsCore(moveIds, targetContainerId);
  const imported = [];
  for (const p of importPaths) {
    if (!fs.existsSync(p)) continue;
    try { imported.push(await importFile(p, targetContainerId, projectId, target.name)); }
    catch(e) { console.error('[MOVE-OR-IMPORT] Import failed:', p, e.message); }
  }
  return { moved, imported };
});

ipcMain.on('start-drag', (event, { filePath, thumbPath, filePaths }) => {
  try {
    const { nativeImage } = require('electron');

    // Build icon from thumb or first file
    let icon;
    try {
      const iconPath = (thumbPath && fs.existsSync(thumbPath)) ? thumbPath : filePath;
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) icon = nativeImage.createEmpty();
    } catch(e) {
      icon = nativeImage.createEmpty();
    }

    // Multi-file drag
    if (filePaths && filePaths.length > 1) {
      const validPaths = filePaths.filter(p => p && fs.existsSync(p));
      if (validPaths.length === 0) return;
      console.log('[DRAG] Multi-drag:', validPaths.length, 'files');
      event.sender.startDragging({ files: validPaths, icon });
    } else {
      // Single file drag
      if (!filePath || !fs.existsSync(filePath)) {
        console.warn('[DRAG] File not found:', filePath);
        return;
      }
      console.log('[DRAG] Single drag:', filePath);
      event.sender.startDragging({ file: filePath, icon });
    }
  } catch(e) {
    console.error('[DRAG] Error:', e.message);
  }
});

ipcMain.handle('open-file', (_, fp) => { if (fp && fs.existsSync(fp)) shell.openPath(fp); });

// Read a local file as base64 data URL for display in renderer
ipcMain.handle('read-thumb', (_, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch(e) {
    console.error('[THUMB READ]', e.message);
    return null;
  }
});

// Regenerate thumbnails for assets that don't have them
ipcMain.handle('regen-thumbnails', async (_, { containerId }) => {
  const assets = getAssets(containerId);
  let count = 0;
  for (const asset of assets) {
    if (!asset.file_path || !fs.existsSync(asset.file_path)) continue;
    if (!['image','vector'].includes(asset.type)) continue;
    const thumbName = `${asset.id}_thumb.png`;
    const thumbPath = path.join(THUMBS_DIR, thumbName);
    const ok = await generateThumb(asset.file_path, thumbPath, asset.type);
    if (ok) {
      run("UPDATE assets SET thumb_path=?, updated_at=datetime('now') WHERE id=?", thumbPath, asset.id);
      count++;
    }
  }
  console.log(`[THUMB] Regenerated ${count} thumbnails for container ${containerId}`);
  return count;
});
ipcMain.handle('get-data-dir', () => DAVENPORT_DIR);
ipcMain.handle('toggle-always-on-top', () => { alwaysOnTop=!alwaysOnTop; mainWindow.setAlwaysOnTop(alwaysOnTop,'floating'); return alwaysOnTop; });

// ── SNAP TO DOCK ─────────────────────────────────────────────────────────
let dockedTo = null; // { bounds, edge, followInterval }
let overlayWindow = null;

function getFrontmostWindowBounds() {
  try {
    const { execFileSync } = require('child_process');
    const script = [
      'tell application "System Events"',
      'set frontApp to first application process whose frontmost is true',
      'set appName to name of frontApp',
      'tell frontApp',
      'if (count of windows) > 0 then',
      'set w to first window',
      'set {x, y} to position of w',
      'set {ww, wh} to size of w',
      'return appName & "," & x & "," & y & "," & ww & "," & wh',
      'end if',
      'end tell',
      'end tell',
    ].join('\n');
    const result = execFileSync('osascript', ['-e', script], { timeout: 300, encoding: 'utf8' }).trim();
    const parts = result.split(',');
    if (parts.length < 5) return null;
    const [appName, x, y, w, h] = parts;
    if (!appName || appName.trim() === 'Electron' || appName.trim() === 'davenport-files') return null;
    return { appName: appName.trim(), x: parseInt(x), y: parseInt(y), width: parseInt(w), height: parseInt(h) };
  } catch(e) {
    return null;
  }
}

function getSnapEdge(dvBounds, targetBounds, threshold = 60) {
  const dock = dvBounds;
  const target = targetBounds;
  
  // Distance from each edge of target
  const distRight  = Math.abs((dock.x) - (target.x + target.width));
  const distLeft   = Math.abs((dock.x + dock.width) - target.x);
  const distTop    = Math.abs((dock.y + dock.height) - target.y);
  const distBottom = Math.abs((dock.y) - (target.y + target.height));

  const min = Math.min(distRight, distLeft, distTop, distBottom);
  if (min > threshold) return null;
  
  if (min === distRight)  return 'right';
  if (min === distLeft)   return 'left';
  if (min === distTop)    return 'top';
  if (min === distBottom) return 'bottom';
  return null;
}

function getSnappedPosition(edge, targetBounds, dvBounds) {
  const t = targetBounds;
  const d = dvBounds;
  switch(edge) {
    case 'right':  return { x: t.x + t.width, y: t.y, width: d.width, height: t.height };
    case 'left':   return { x: t.x - d.width, y: t.y, width: d.width, height: t.height };
    case 'top':    return { x: t.x, y: t.y - d.height, width: t.width, height: d.height };
    case 'bottom': return { x: t.x, y: t.y + t.height, width: t.width, height: d.height };
  }
}

ipcMain.handle('check-snap', () => {
  try {
    const target = getFrontmostWindowBounds();
    if (!target) return null;
    
    const dvBounds = mainWindow.getBounds();
    const edge = getSnapEdge(dvBounds, target, 80);
    
    if (edge) {
      const snapPos = getSnappedPosition(edge, target, dvBounds);
      return { edge, target, snapPos, appName: target.appName };
    }
    return null;
  } catch(e) {
    return null;
  }
});

ipcMain.handle('do-snap', (_, { edge, target, appName }) => {
  try {
    const dvBounds = mainWindow.getBounds();
    const snapPos = getSnappedPosition(edge, target, dvBounds);
    
    mainWindow.setBounds({
      x: Math.round(snapPos.x),
      y: Math.round(snapPos.y),
      width: Math.round(snapPos.width),
      height: Math.round(snapPos.height),
    }, true); // animate
    
    mainWindow.setAlwaysOnTop(true, 'floating');
    
    // Start following the target window
    if (dockedTo?.followInterval) clearInterval(dockedTo.followInterval);
    dockedTo = {
      appName,
      edge,
      followInterval: setInterval(() => {
        try {
          const newTarget = getFrontmostWindowBounds();
          if (!newTarget || newTarget.appName !== appName) return;
          const newSnap = getSnappedPosition(edge, newTarget, mainWindow.getBounds());
          const curr = mainWindow.getBounds();
          if (Math.abs(curr.x - newSnap.x) > 2 || Math.abs(curr.y - newSnap.y) > 2) {
            mainWindow.setBounds({ x: Math.round(newSnap.x), y: Math.round(newSnap.y), width: Math.round(newSnap.width), height: Math.round(newSnap.height) });
          }
        } catch(e) {}
      }, 100)
    };
    
    return { success: true, appName, edge };
  } catch(e) {
    console.error('[SNAP]', e.message);
    return { success: false };
  }
});

ipcMain.handle('do-undock', () => {
  if (dockedTo?.followInterval) clearInterval(dockedTo.followInterval);
  dockedTo = null;
  return true;
});

ipcMain.handle('get-dock-state', () => {
  return dockedTo ? { docked: true, appName: dockedTo.appName, edge: dockedTo.edge } : { docked: false };
});

ipcMain.handle('get-window-bounds', () => mainWindow.getBounds());

ipcMain.handle('export-container', async (_, { container, assets, project }) => {
  const sn = safeName(container.name);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(EXPORTS_DIR, `${sn}.davenport-files.zip`),
    filters: [{ name: 'Davenport Package', extensions: ['zip'] }]
  });
  if (result.canceled) return false;
  try {
    const archiver = require('archiver');
    const output = fs.createWriteStream(result.filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    await new Promise((resolve, reject) => {
      output.on('close', resolve); archive.on('error', reject); archive.pipe(output);
      archive.append(JSON.stringify({ project, container, assets, exported_at: new Date().toISOString(), version:'0.2.0' }, null, 2), { name: 'manifest.json' });
      assets.forEach(a => {
        if (a.file_path && fs.existsSync(a.file_path)) archive.file(a.file_path, { name: `assets/${a.title}` });
        if (a.thumb_path && fs.existsSync(a.thumb_path)) archive.file(a.thumb_path, { name: `thumbnails/${path.basename(a.thumb_path)}` });
      });
      archive.finalize();
    });
    return true;
  } catch(e) { console.error(e.message); return false; }
});

ipcMain.handle('regenerate-thumbnails', async (_, { containerId }) => {
  try {
    const sharp = require('sharp');
    const assets = containerId
      ? db.prepare('SELECT * FROM assets WHERE container_id=?').all(containerId)
      : db.prepare('SELECT * FROM assets').all();
    let count = 0;
    for (const asset of assets) {
      if (!asset.file_path || !fs.existsSync(asset.file_path)) continue;
      if (!['image','vector'].includes(asset.type)) continue;
      const thumbPath = path.join(THUMBS_DIR, `${asset.id}_thumb.png`);
      try {
        await sharp(asset.file_path)
          .resize(200, 200, { fit: 'cover' })
          .png()
          .toFile(thumbPath);
        db.prepare("UPDATE assets SET thumb_path=?, updated_at=datetime('now') WHERE id=?")
          .run(thumbPath, asset.id);
        count++;
      } catch(e) {
        console.warn('[THUMB] Failed for', asset.file_path, e.message);
      }
    }
    console.log(`[THUMB] Regenerated ${count} thumbnails`);
    return { count };
  } catch(e) {
    console.error('[THUMB] Regenerate error:', e.message);
    return { count: 0, error: e.message };
  }
});

ipcMain.handle('import-dock-package', async (_, { projectId }) => {
  const result = await dialog.showOpenDialog(mainWindow, { filters: [{ name: 'Davenport Package', extensions: ['zip'] }], properties: ['openFile'] });
  if (result.canceled) return null;
  try {
    const unzipper = require('unzipper');
    const zip = await unzipper.Open.file(result.filePaths[0]);
    const me = zip.files.find(f => f.path === 'manifest.json');
    if (!me) return null;
    const manifest = JSON.parse((await me.buffer()).toString());
    const { container, assets } = manifest;
    const newCid = `cont-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    run('INSERT INTO containers(id,project_id,parent_id,name,notes,sort_order) VALUES(?,?,NULL,?,?,0)', newCid, projectId, `${container.name} (imported)`, container.notes||'');
    const pkgDir = ensureDir(containerDirPath(newCid)) || ASSETS_DIR;
    for (const a of (assets||[])) {
      const fe = zip.files.find(f => f.path === `assets/${a.title}`);
      if (fe) {
        const buf = await fe.buffer();
        const dest = path.join(pkgDir, a.title);
        fs.writeFileSync(dest, buf);
        const seq = nextSeq(newCid);
        run('INSERT INTO assets(id,container_id,project_id,type,file_path,thumb_path,title,original_name,sequence_num,tags,notes,source,license,prompt_text,color,size,dimensions,duration,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          `asset-i-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, newCid, projectId,
          a.type, dest, '', a.title, a.original_name||'', seq, JSON.stringify(a.tags||[]),
          a.notes||'', 'Imported', a.license||'', a.prompt_text||'', a.color||'', a.size||'', a.dimensions||'', a.duration||'', a.state||'raw');
      }
    }
    return getContainers(projectId);
  } catch(e) { console.error(e.message); return null; }
});
