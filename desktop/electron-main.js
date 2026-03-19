const { app, BrowserWindow, Menu, shell, utilityProcess, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');

// Dev when not packaged (app.isPackaged is false during electron .)
const isDev = !app.isPackaged;
const VITE_URL = 'http://127.0.0.1:5173';
const BACKEND_PORT = 4173;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

let backendProcess = null;

// ── Backend lifecycle ──────────────────────────────────────────────

function getUserDataDir() {
  return app.getPath('userData');
}

function startBackend() {
  if (isDev) return; // dev mode: backend runs separately

  const userDataDir = getUserDataDir();

  // First launch: copy seed DB if no DB exists yet
  const dbPath = path.join(userDataDir, 'oneteam.db');
  if (!fs.existsSync(dbPath)) {
    const seedPath = path.join(process.resourcesPath, 'backend', 'seed.db');
    if (fs.existsSync(seedPath)) {
      fs.copyFileSync(seedPath, dbPath);
    }
  }

  const serverJs = path.join(process.resourcesPath, 'backend', 'server.js');
  backendProcess = utilityProcess.fork(serverJs, [], {
    env: {
      ...process.env,
      ONETEAM_USER_DATA_DIR: userDataDir,
      OPC_BACKEND_PORT: String(BACKEND_PORT),
      NODE_ENV: 'production',
    },
    cwd: path.join(process.resourcesPath, 'backend'),
    stdio: 'pipe',
  });

  const logFile = path.join(userDataDir, 'backend.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'w' });
  logStream.write(`[${new Date().toISOString()}] Starting backend: ${serverJs}\n`);
  logStream.write(`[${new Date().toISOString()}] CWD: ${path.join(process.resourcesPath, 'backend')}\n`);
  logStream.write(`[${new Date().toISOString()}] ONETEAM_USER_DATA_DIR: ${userDataDir}\n`);

  backendProcess.stdout?.on('data', (d) => {
    const msg = d.toString().trim();
    console.log('[backend]', msg);
    logStream.write(`[stdout] ${msg}\n`);
  });
  backendProcess.stderr?.on('data', (d) => {
    const msg = d.toString().trim();
    console.error('[backend]', msg);
    logStream.write(`[stderr] ${msg}\n`);
  });
  backendProcess.on('exit', (code) => {
    const msg = `Backend exited with code ${code}`;
    console.log(msg);
    logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
    logStream.end();
    backendProcess = null;
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

function waitForBackend(timeoutMs = 30000) {
  if (isDev) return Promise.resolve(); // dev mode: assume backend is running

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`${BACKEND_URL}/api/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('Backend did not start within timeout'));
      }
      setTimeout(check, 500);
    };
    check();
  });
}

// ── Window ─────────────────────────────────────────────────────────

function createWindow() {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'public', 'desktop_logo.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#F4F4F4',
      symbolColor: '#48484A',
      height: 36,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Open external links in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const appOrigins = ['http://127.0.0.1:5173', 'file://'];
    if (!appOrigins.some(o => url.startsWith(o))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev) {
    win.webContents.on('did-fail-load', (_event, errorCode) => {
      if (errorCode === -102) {
        setTimeout(() => win.loadURL(VITE_URL).catch(() => {}), 500);
      }
    });
    win.loadURL(VITE_URL).catch(() => {});
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  return win;
}

// ── Auto-updater ──────────────────────────────────────────────────

// Fallback update server when GitHub is unreachable.
// Set via env var or defaults to empty (GitHub-only).
// To use: host latest.yml + installer files on any static server,
// then set ONETEAM_UPDATE_URL=https://your-server.com/updates
const FALLBACK_UPDATE_URL = process.env.ONETEAM_UPDATE_URL || '';

let mainWindow = null;

async function checkForUpdatesWithFallback() {
  // Try GitHub first (default provider from package.json)
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'goodpostidea-tech',
      repo: 'oneteam',
    });
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (err) {
    console.log('GitHub update check failed, trying fallback...', err.message);
  }

  // Fallback to generic server
  if (FALLBACK_UPDATE_URL) {
    try {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: FALLBACK_UPDATE_URL,
      });
      const result = await autoUpdater.checkForUpdates();
      return result;
    } catch (err) {
      console.error('Fallback update check also failed:', err.message);
    }
  }

  return null;
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', { version: info.version, releaseNotes: info.releaseNotes });
  });
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-progress', { percent: progress.percent });
  });
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', { version: info.version });
  });
  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message);
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('check-for-update', () => checkForUpdatesWithFallback());
}

// ── App lifecycle ──────────────────────────────────────────────────

app.whenReady().then(async () => {
  startBackend();

  try {
    await waitForBackend();
  } catch (e) {
    console.error('Failed to start backend:', e.message);
  }

  mainWindow = createWindow();
  setupAutoUpdater();
  checkForUpdatesWithFallback().catch(() => {});

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

app.on('will-quit', () => {
  stopBackend();
});
