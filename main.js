const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const isDev = !app.isPackaged;

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

// Configure auto-updater
autoUpdater.autoDownload = false;  // Don't download automatically - let user approve
autoUpdater.autoInstallOnAppQuit = true;

// Use generic provider to avoid GitHub API 406 errors
// This directly fetches the update manifest from the latest release
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://github.com/mtzahi/Test_Electron_update/releases/latest/download'
});

let mainWindow = null;

function sendUpdateStatus(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, ...data });
  }
}

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    sendUpdateStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    sendUpdateStatus('available', { version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available');
    sendUpdateStatus('not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download progress: ${progress.percent.toFixed(1)}%`);
    sendUpdateStatus('downloading', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    sendUpdateStatus('downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    log.error('Update error:', err);
    sendUpdateStatus('error', { message: err.message });
  });
}

function setupIpcHandlers() {
  ipcMain.handle('check-for-updates', async () => {
    if (isDev) {
      return { status: 'dev-mode', message: 'Updates disabled in development' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { status: 'checking', updateInfo: result?.updateInfo };
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { status: 'downloading' };
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  setupIpcHandlers();
  setupAutoUpdater();
  createWindow();

  // Check for updates after a short delay (only in production)
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        log.error('Initial update check failed:', err);
      });
    }, 3000);

    // Check for updates every 4 hours
    setInterval(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        log.error('Periodic update check failed:', err);
      });
    }, 4 * 60 * 60 * 1000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
