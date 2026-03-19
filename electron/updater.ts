import { autoUpdater, UpdateInfo } from 'electron-updater';
import { BrowserWindow, dialog, Notification } from 'electron';

// ─── Auto-Updater ────────────────────────────────────────────────────────────
// Uses electron-updater to check GitHub Releases for new versions.
// Downloads in the background, then prompts the user to restart.

let updateWindow: BrowserWindow | null = null;

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // Privacy: disable auto-download — we ask the user first
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Check for updates every 30 minutes
  const CHECK_INTERVAL = 30 * 60 * 1000;

  // ── Events ──────────────────────────────────────────────────────────────

  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow(mainWindow, 'update-checking');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    sendStatusToWindow(mainWindow, 'update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
    });

    // Show native notification
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'PolarChat Update Available',
        body: `Version ${info.version} is ready to download.`,
        silent: true,
      });
      notification.on('click', () => {
        mainWindow.show();
        mainWindow.focus();
      });
      notification.show();
    }

    // Ask user if they want to download
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `PolarChat v${info.version} is available.`,
        detail: 'Would you like to download and install the update? The app will restart after the update.',
        buttons: ['Download & Install', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
          sendStatusToWindow(mainWindow, 'update-downloading');
        }
      });
  });

  autoUpdater.on('update-not-available', () => {
    sendStatusToWindow(mainWindow, 'update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatusToWindow(mainWindow, 'update-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    sendStatusToWindow(mainWindow, 'update-downloaded', {
      version: info.version,
    });

    // Prompt user to restart
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `PolarChat v${info.version} has been downloaded.`,
        detail: 'Restart now to apply the update?',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
  });

  autoUpdater.on('error', (err) => {
    // Don't bother the user with update errors — just log silently
    console.error('Auto-updater error:', err.message);
    sendStatusToWindow(mainWindow, 'update-error');
  });

  // ── Initial check + periodic checks ─────────────────────────────────────

  // Wait 10 seconds after launch before first check (let the app settle)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10_000);

  // Then check periodically
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, CHECK_INTERVAL);
}

// Send update status to renderer via IPC
function sendStatusToWindow(
  window: BrowserWindow,
  status: string,
  data?: Record<string, unknown>
): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send('update-status', { status, ...data });
  }
}

// Allow manual check from renderer
export function checkForUpdatesManually(): void {
  autoUpdater.checkForUpdates().catch(() => {});
}
