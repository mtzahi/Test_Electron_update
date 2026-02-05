const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { spawn, execSync } = require('child_process');
const net = require('net');
const http = require('http');

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
let backendProcess = null;
let backendPort = null;

// --- Backend lifecycle ---

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function getBackendBinaryPath() {
  if (isDev) {
    return null; // In dev, we run python directly
  }
  const binaryName = process.platform === 'win32' ? 'backend-api.exe' : 'backend-api';
  return path.join(process.resourcesPath, binaryName);
}

function spawnBackend(port) {
  return new Promise((resolve, reject) => {
    let proc;

    if (isDev) {
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const scriptPath = path.join(__dirname, 'backend', 'main.py');
      proc = spawn(pythonCmd, [scriptPath, '--port', String(port)], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } else {
      const binaryPath = getBackendBinaryPath();
      proc = spawn(binaryPath, ['--port', String(port)], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
    }

    proc.stdout.on('data', (data) => {
      log.info(`[backend] ${data.toString().trim()}`);
    });

    proc.stderr.on('data', (data) => {
      log.info(`[backend:err] ${data.toString().trim()}`);
    });

    proc.on('error', (err) => {
      log.error('Failed to start backend:', err.message);
      reject(err);
    });

    proc.on('exit', (code, signal) => {
      log.info(`Backend exited with code=${code}, signal=${signal}`);
      backendProcess = null;
    });

    resolve(proc);
  });
}

function pollHealth(port, retries = 30, interval = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function check() {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            log.info(`Backend healthy after ${attempts} attempt(s)`);
            resolve();
          } else if (attempts < retries) {
            setTimeout(check, interval);
          } else {
            reject(new Error(`Backend not healthy after ${retries} attempts`));
          }
        });
      });

      req.on('error', () => {
        if (attempts < retries) {
          setTimeout(check, interval);
        } else {
          reject(new Error(`Backend not reachable after ${retries} attempts`));
        }
      });

      req.end();
    }

    check();
  });
}

function killBackend() {
  if (!backendProcess) return;

  log.info('Killing backend process...');
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /f /t /pid ${backendProcess.pid}`, { stdio: 'ignore' });
    } else {
      backendProcess.kill('SIGTERM');
    }
  } catch (err) {
    log.error('Error killing backend:', err.message);
  }
  backendProcess = null;
}

// --- Auto-updater ---

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

  ipcMain.handle('get-backend-port', () => {
    return backendPort;
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

app.whenReady().then(async () => {
  setupIpcHandlers();
  setupAutoUpdater();

  // Start backend
  try {
    backendPort = await getFreePort();
    log.info(`Starting backend on port ${backendPort}...`);
    backendProcess = await spawnBackend(backendPort);
    await pollHealth(backendPort);
    log.info('Backend is ready');
  } catch (err) {
    log.error('Failed to start backend:', err.message);
    // Continue anyway — the UI will show "offline"
  }

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

app.on('will-quit', () => {
  killBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
