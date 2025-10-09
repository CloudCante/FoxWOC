// src/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

if (require('electron-squirrel-startup')) {
  app.quit();
}

// Resolve assets in dev & prod (uses unpacked dir in prod)
function resolveAsset(relPath) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', relPath);
  }
  return path.resolve(__dirname, '..', '..', relPath);
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

ipcMain.handle('load-approved-serials', async () => {
  try {
    const filePath = resolveAsset('input/batchall_report.xlsx');
    const data = fs.readFileSync(filePath);
    const workbook = xlsx.read(data, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    return rows.slice(1).map(r => String(r[0]).trim()).filter(Boolean);
  } catch (err) {
    console.error('Error loading Excel:', err);
    return [];
  }
});

ipcMain.handle('load-output-template', async () => {
  const filePath = resolveAsset('input/outputTemplate.xlsx');
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
