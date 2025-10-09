const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

if (require('electron-squirrel-startup')) {
  app.quit();
}

function resolveAsset(relPath) {
  // Works in dev & prod (requires input/ to be packaged as extraResource)
  const base = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..', '..');
  return path.join(base, relPath);
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

// IPC: approved list from Excel
ipcMain.handle('load-approved-serials', async () => {
  try {
    const filePath = resolveAsset('input/batchall_report.xlsx');
    const data = fs.readFileSync(filePath);
    const wb = xlsx.read(data, { type: 'buffer' });
    const sn = wb.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sn], { header: 1 });
    return rows.slice(1).map(r => String(r[0]).trim()).filter(Boolean);
  } catch (err) {
    console.error('Error loading Excel:', err);
    return [];
  }
});

// IPC: template bytes
ipcMain.handle('load-output-template', async () => {
  const filePath = resolveAsset('input/outputTemplate.xlsx');
  return fs.readFileSync(filePath);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
