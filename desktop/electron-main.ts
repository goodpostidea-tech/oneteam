import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';

// 限制渲染进程内存，减少空闲内存占用
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
// 禁用不需要的 GPU 特性以减少内存
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

function createWindow() {
  // Remove default menu bar (File, Edit, View, etc.)
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#374151',
      height: 36,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: true,  // 后台标签页降低资源消耗
      spellcheck: false,           // 禁用拼写检查减少内存
    },
    show: false,                   // 先不显示，等 ready-to-show
  });

  // 窗口准备好后再显示，避免白屏闪烁
  win.once('ready-to-show', () => win.show());

  // 拦截 target="_blank" → 用系统默认浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 拦截页内导航到外部 URL
  win.webContents.on('will-navigate', (event, url) => {
    const appOrigins = ['http://localhost:5173', 'file://'];
    if (!appOrigins.some(o => url.startsWith(o))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
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
