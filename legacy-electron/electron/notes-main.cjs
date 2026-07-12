'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');

// Allow multiple instances — Notes runs independently alongside Files
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 440,
    height: 560,
    minWidth: 220,
    minHeight: 200,
    backgroundColor: '#080C09',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 10, y: 10 },
    title: 'Davenport Notes',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      webSecurity: false,
    },
    show: false,
  });

  const notesPath = path.join(__dirname, '../notes/davenport-notes.html');
  win.loadFile(notesPath);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
}

app.whenReady().then(createWindow);

// Notes quits when its window closes — doesn't affect Files
app.on('window-all-closed', () => app.quit());
