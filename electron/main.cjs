const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

nativeTheme.themeSource = 'dark';

// Must be called before app is ready
const { protocol } = require('electron');
protocol.registerSchemesAsPrivileged([
  { scheme: 'dockyard', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
]);
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

const DOCKYARD_DIR = path.join(os.homedir(), 'Dockyard');
const ASSETS_DIR   = path.join(DOCKYARD_DIR, 'assets');
const THUMBS_DIR   = path.join(DOCKYARD_DIR, 'thumbnails');
const EXPORTS_DIR  = path.join(DOCKYARD_DIR, 'exports');
[DOCKYARD_DIR, ASSETS_DIR, THUMBS_DIR, EXPORTS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

let db = null;
try {
  const Database = require('better-sqlite3');
  db = new Database(path.join(DOCKYARD_DIR, 'dockyard.db'));
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
} catch(e) { console.warn('[ELECTRON] SQLite memory mode:', e.message); }

const q   = (sql, ...a) => { try { return db ? db.prepare(sql).all(...a) : []; } catch(e) { return []; } };
const run = (sql, ...a) => { try { if (db) db.prepare(sql).run(...a); } catch(e) { console.error(e.message); } };
const g1  = (sql, ...a) => { try { return db ? db.prepare(sql).get(...a) : null; } catch(e) { return null; } };

const getProjects    = ()  => q('SELECT * FROM projects ORDER BY created_at ASC');
const getContainers  = (pid) => q('SELECT * FROM containers WHERE project_id=? ORDER BY sort_order ASC, created_at ASC', pid);
const getAssets      = (cid) => q('SELECT * FROM assets WHERE container_id=? ORDER BY sequence_num ASC, created_at ASC', cid).map(a=>({...a,tags:JSON.parse(a.tags||'[]')}));
const nextSeq        = (cid) => { const r=g1('SELECT MAX(sequence_num) as m FROM assets WHERE container_id=?',cid); return (r?.m||0)+1; };
const safeName       = (s)   => s.replace(/[^a-zA-Z0-9\-_]/g,'-').replace(/-+/g,'-').slice(0,40);

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
  const seq = nextSeq(containerId);
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
  const newName = `${sName}_${String(seq).padStart(3,'0')}${finalExt}`;
  const destPath = path.join(ASSETS_DIR, newName);
  fs.copyFileSync(srcForCopy, destPath);
  if (srcForCopy !== filePath && fs.existsSync(srcForCopy)) fs.unlinkSync(srcForCopy);
  const thumbPath = path.join(THUMBS_DIR, `${assetId}_thumb.png`);
  await generateThumb(destPath, thumbPath, type);
  const asset = {
    id: assetId, container_id: containerId, project_id: projectId, type,
    file_path: destPath, thumb_path: fs.existsSync(thumbPath) ? thumbPath : '',
    title: newName, original_name: path.basename(filePath), sequence_num: seq,
    tags: '[]', notes: '', source: 'Imported', license: '', prompt_text: '',
    color: '', size: `${(stat.size/1024/1024).toFixed(1)} MB`, dimensions: '—', duration: '', state: 'raw',
  };
  run(`INSERT OR REPLACE INTO assets(id,container_id,project_id,type,file_path,thumb_path,title,original_name,sequence_num,tags,notes,source,license,prompt_text,color,size,dimensions,duration,state)
    VALUES(@id,@container_id,@project_id,@type,@file_path,@thumb_path,@title,@original_name,@sequence_num,@tags,@notes,@source,@license,@prompt_text,@color,@size,@dimensions,@duration,@state)`, asset);
  return { ...asset, tags: [] };
}

let mainWindow;
let alwaysOnTop = false;

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
  protocol.registerFileProtocol('dockyard', (request, callback) => {
    try {
      const url = request.url.replace('dockyard://', '');
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

ipcMain.handle('get-projects', () => getProjects());
ipcMain.handle('upsert-project', (_, p) => {
  run(`INSERT OR REPLACE INTO projects(id,name,description,client,scope,deliverables,deadline,status,notes,created_at,updated_at)
    VALUES(@id,@name,@description,@client,@scope,@deliverables,@deadline,@status,@notes,COALESCE((SELECT created_at FROM projects WHERE id=@id),datetime('now')),datetime('now'))`, p);
  return getProjects();
});
ipcMain.handle('delete-project', (_, id) => { run('DELETE FROM projects WHERE id=?', id); return getProjects(); });

ipcMain.handle('get-containers', (_, pid) => getContainers(pid));
ipcMain.handle('upsert-container', (_, c) => {
  run(`INSERT OR REPLACE INTO containers(id,project_id,parent_id,name,notes,sort_order,created_at,updated_at)
    VALUES(@id,@project_id,@parent_id,@name,@notes,@sort_order,COALESCE((SELECT created_at FROM containers WHERE id=@id),datetime('now')),datetime('now'))`, c);
  return getContainers(c.project_id);
});
ipcMain.handle('delete-container', (_, { id, projectId }) => { run('DELETE FROM containers WHERE id=?', id); return getContainers(projectId); });

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
  for (const fp of result.filePaths) imported.push(await importFile(fp, containerId, projectId, containerName));
  return imported;
});

ipcMain.handle('import-dropped-files', async (_, { filePaths, containerId, projectId, containerName }) => {
  const imported = [];
  for (const fp of filePaths) { if (fs.existsSync(fp)) imported.push(await importFile(fp, containerId, projectId, containerName)); }
  return imported;
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
ipcMain.handle('get-data-dir', () => DOCKYARD_DIR);
ipcMain.handle('toggle-always-on-top', () => { alwaysOnTop=!alwaysOnTop; mainWindow.setAlwaysOnTop(alwaysOnTop,'floating'); return alwaysOnTop; });

ipcMain.handle('export-container', async (_, { container, assets, project }) => {
  const sn = safeName(container.name);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(EXPORTS_DIR, `${sn}.dockyard.zip`),
    filters: [{ name: 'Dockyard Package', extensions: ['zip'] }]
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
  const result = await dialog.showOpenDialog(mainWindow, { filters: [{ name: 'Dockyard Package', extensions: ['zip'] }], properties: ['openFile'] });
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
    for (const a of (assets||[])) {
      const fe = zip.files.find(f => f.path === `assets/${a.title}`);
      if (fe) {
        const buf = await fe.buffer();
        const dest = path.join(ASSETS_DIR, `${newCid}_${a.title}`);
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
