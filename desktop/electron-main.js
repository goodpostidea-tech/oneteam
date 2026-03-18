const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// Dev when VITE_DEV_SERVER_URL is set, or fallback: check if dist exists
const VITE_URL = 'http://127.0.0.1:5173';
const isDev = !require('fs').existsSync(require('path').join(__dirname, 'dist', 'index.html'));

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
    },
  });

  // 拦截 target="_blank" → 用系统默认浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 拦截页内导航到外部 URL
  win.webContents.on('will-navigate', (event, url) => {
    const appOrigins = ['http://127.0.0.1:5173', 'file://'];
    if (!appOrigins.some(o => url.startsWith(o))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev) {
    // 如果 Vite 还没就绪（ERR_CONNECTION_REFUSED = -102），每 500ms 重试一次
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
}

app.whenReady().then(() => {
  createWindow();

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
