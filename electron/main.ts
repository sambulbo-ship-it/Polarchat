import { app, BrowserWindow, session } from 'electron';
import * as path from 'path';

// Privacy: Disable hardware acceleration fingerprinting
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

// Privacy: Disable remote module
app.commandLine.appendSwitch('disable-remote-module');

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // Privacy: Clear all storage on startup
  session.defaultSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'cachestorage'],
  });

  // Privacy: Block all permission requests except media (for voice)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = ['media']; // Only allow microphone for voice chat
    callback(allowedPermissions.includes(permission));
  });

  // Privacy: Remove referrer headers
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const { requestHeaders } = details;
    delete requestHeaders['Referer'];
    delete requestHeaders['Origin'];
    callback({ requestHeaders });
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: 'PolarChat',
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Privacy: Don't send referrer
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../client/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  // Privacy: Clear all session data on quit
  session.defaultSession.clearStorageData();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Privacy: Prevent navigation to external URLs
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event) => {
    event.preventDefault();
  });
});
