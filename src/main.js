const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

if (require('electron-squirrel-startup')) {
  app.quit();
}

app.disableHardwareAcceleration();
app.setAppLogsPath();

const gotLock = app.requestSingleInstanceLock();
if(!gotLock){
  app.quit();
}else{
  app.on('second-instance',() =>{
    const [win] = BrowserWindow.getAllWindows();
    if(win){
      win.show();
      win.focus();
    }
  });
}

process.on('uncaughtException', (err) => {
  try {
    dialog.showErrorBox('Main process error', String(err?.stack || err));
  }catch{}
  app.exit(1);
});

process.on('unhandledRejection',(res) => {
  try{
    dialog.showErrorBox('Main promise rejection', String(res));
  }catch{}
  app.exit(1);
});

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

  win.webContents.on('did-fail-load',(_e,code,desc) =>{
    try{dialog.showErrorBox('Window failed to load',`${code}:${desc}`);} catch{}
    app.exit(1);
  });
  win.webContents.on('render-process-gone',(_e,details) => {
    app.exit(1);
  });
  app.on('child-process-gone',(_e,details) => {app.exit(1);});

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
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);

    const ws = wb.worksheets[0];
    const serials = [];
    ws.eachRow((row,rowNumber) =>{
      if(rowNumber > 1){
        const value = row.getCell(1).value;
        if(value){
          serials.push(String(value).trim());
        }
      }
    });
    return serials;
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
