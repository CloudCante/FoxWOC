// src/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

if (require('electron-squirrel-startup')) {
  app.quit();
}

function findRendererUrl() {
  // Try common keys first
  const candidates = [
    process.env.ELECTRON_RENDERER_URL,
    process.env.ELECTRON_RENDERER_URL_main_window,
    process.env.ELECTRON_RENDERER_URL_renderer,
    process.env.VITE_DEV_SERVER_URL,
    process.env.VITE_DEV_SERVER_URL_main_window,
    process.env.VITE_DEV_SERVER_URL_renderer,
  ].filter(Boolean);

  // Also scan every env var for a localhost http URL
  const allMatches = Object.values(process.env).filter(
    v => typeof v === 'string' && /^https?:\/\/localhost:\d+/i.test(v)
  );

  return candidates[0] || allMatches[0] || null;
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, './preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.error('did-fail-load:', code, desc, url);
  });

  // Show what we see
  const electronEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k.startsWith('ELECTRON_') || k.startsWith('VITE_'))
  );
  console.log('ELECTRON_/VITE_ envs:', electronEnv);

  let rendererUrl = findRendererUrl();

  // As a last resort in dev, fall back to Vite’s default port
  if (!rendererUrl && process.env.NODE_ENV !== 'production') {
    rendererUrl = 'http://localhost:5173';
    console.warn('No renderer URL env found; falling back to', rendererUrl);
  }

  if (rendererUrl) {
    await win.loadURL(rendererUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // packaged (or if dev server truly isn’t running)
    await win.loadFile(path.join(__dirname, './renderer/index.html'));
  }
}

ipcMain.handle('load-approved-serials', async() => {
    try {
        const filePath = path.resolve(__dirname, '../input/batchall_report.xlsx');
        const data = fs.readFileSync(filePath);
        const workbook = xlsx.read(data, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        return rows.slice(1).map(r => String(r[0]).trim()).filter(Boolean); // assume serials in col A
    } catch (err) {
        console.error('Error loading Excel:', err);
        return [];
    }
});

ipcMain.handle('load-output-template', async() => {
    console.log('Loading template file');
    const filePath = path.resolve(__dirname, '../input/outputTemplate.xlsx');
    return fs.readFileSync(filePath);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
