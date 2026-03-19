import { app, BrowserWindow, session, Tray, Menu, nativeImage, shell, ipcMain, Notification } from 'electron';
import * as path from 'path';
import { fork, ChildProcess } from 'child_process';
import { initAutoUpdater, checkForUpdatesManually } from './updater';

// Privacy: Disable hardware acceleration fingerprinting
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
app.commandLine.appendSwitch('disable-remote-module');

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// ─── Embedded Server ─────────────────────────────────────────────────────────
// In production, PolarChat bundles the server inside the app.
// The server runs as a forked child process — completely local, no external calls.

function startEmbeddedServer(): void {
  if (isDev) {
    // In dev, server is started separately via `npm run dev:server`
    return;
  }

  const serverPath = path.join(process.resourcesPath, 'server', 'dist', 'index.js');

  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: '3001',
      NODE_ENV: 'production',
      CORS_ORIGIN: 'polarchat://*',
    },
    stdio: 'ignore',
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start embedded server:', err.message);
  });
}

function stopEmbeddedServer(): void {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// ─── Window Creation ─────────────────────────────────────────────────────────

function createWindow(): void {
  // Privacy: Clear all storage on startup
  session.defaultSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'cachestorage'],
  });

  // Privacy: Only allow microphone (for voice chat)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  // Privacy: Strip referrer and tracking headers
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const { requestHeaders } = details;
    delete requestHeaders['Referer'];
    delete requestHeaders['Origin'];
    delete requestHeaders['User-Agent'];
    callback({ requestHeaders });
  });

  // Privacy: Block all external requests in production
  if (!isDev) {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url);
      const allowed = ['localhost', '127.0.0.1', 'polarchat'];
      // Allow GitHub for auto-updater downloads
      const updateHosts = ['github.com', 'api.github.com', 'objects.githubusercontent.com'];
      if (url.protocol === 'file:' || url.protocol === 'devtools:' || allowed.some(h => url.hostname.includes(h)) || updateHosts.some(h => url.hostname === h)) {
        callback({ cancel: false });
      } else {
        callback({ cancel: true }); // Block all external network requests
      }
    });
  }

  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: 'PolarChat',
    backgroundColor: '#1a1a2e',
    icon: iconPath,
    // macOS: sleek title bar integrated with content
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Windows: frameless with custom title bar option
    frame: process.platform !== 'win32',
    titleBarOverlay: process.platform === 'win32' ? {
      color: '#1a1a2e',
      symbolColor: '#e4e4e7',
      height: 36,
    } : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Deny all new windows (privacy: no popups)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load from bundled client files using custom protocol
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  // macOS: hide window instead of closing (stays in dock)
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── System Tray ─────────────────────────────────────────────────────────────

function createTray(): void {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let trayIcon: nativeImage;

  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    // Fallback: create a simple colored icon if file doesn't exist
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('PolarChat - Private & Secure');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show PolarChat',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Privacy Status: Active',
      enabled: false,
      icon: nativeImage.createEmpty(),
    },
    { type: 'separator' },
    {
      label: 'Quit PolarChat',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

// ─── App Menu (macOS) ────────────────────────────────────────────────────────

function createAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{
      label: 'PolarChat',
      submenu: [
        { role: 'about' as const, label: 'About PolarChat' },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ role: 'toggleDevTools' as const }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin' ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.on('ready', () => {
  startEmbeddedServer();
  createAppMenu();
  createWindow();
  createTray();
  registerIpcHandlers();

  // Auto-updater (production only — skipped in dev)
  if (!isDev && mainWindow) {
    initAutoUpdater(mainWindow);
  }
});

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  // Window controls (for custom titlebar on Windows)
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window:close', () => mainWindow?.close());

  // App version
  ipcMain.handle('app:version', () => app.getVersion());

  // Native notifications
  ipcMain.on('app:notify', (_event, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: false }).show();
    }
  });

  // Manual update check from renderer
  ipcMain.on('app:check-updates', () => {
    checkForUpdatesManually();
  });
}

// Handle second instance (focus existing window)
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopEmbeddedServer();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  // Privacy: Clear all session data on quit
  session.defaultSession.clearStorageData();
  stopEmbeddedServer();
});

// Privacy: Block all navigation to external URLs
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      event.preventDefault();
    }
  });

  // Block new windows
  contents.setWindowOpenHandler(({ url }) => {
    // Allow opening links in external browser if user explicitly clicks
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});
