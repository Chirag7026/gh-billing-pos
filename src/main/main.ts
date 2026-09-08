import { app, BrowserWindow } from 'electron';
import * as path from 'node:path';
import { connectDb } from './db.js';
import { registerIpc } from './ipc.js';
import { startSyncEngine, syncNow, pauseSync } from './sync.js';
import { getSettings } from './config.js';
import { ensureLocalMongo, stopEmbeddedMongo, isEmbeddedRunning } from './dbManager.js';
import { createBackup, startBackupScheduler } from './backup.js';

// ---------------------------------------------------------------------------
// Single-instance lock: a second launch focuses the running window and exits,
// avoiding two writers against the same MongoDB data files.
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let quitting = false; // OS-level quit in progress (before-quit path)
let exiting = false; // TitleBar ✕ graceful-exit pipeline running

function focusWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

app.on('second-instance', () => focusWindow());

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Exit pipeline (TitleBar ✕, after renderer-side unsaved-bill confirmation):
 * 1. Immediate differential sync flush.
 * 2. Optional snapshot backup (bounded — never hangs the exit).
 * 3. Safe embedded-mongod shutdown.
 * 4. app.quit().
 */
async function gracefulExit(withBackup = true): Promise<void> {
  if (exiting) return;
  exiting = true;
  quitting = true; // before-quit must not re-run the mongo shutdown
  pauseSync();
  try {
    await withTimeout(syncNow(mainWindow), 45_000, 'sync flush');
    console.log('[main] exit: sync flushed');
  } catch (e: any) {
    console.warn('[main] exit: sync flush failed:', e?.message);
  }
  if (withBackup) {
    try {
      const b = await withTimeout(createBackup('exit'), 120_000, 'exit snapshot');
      console.log(`[main] exit: snapshot ${b.name} (${b.size} bytes)`);
    } catch (e: any) {
      console.warn('[main] exit: snapshot failed (continuing):', e?.message);
    }
  } else {
    console.log('[main] exit: snapshot skipped by user choice');
  }
  try {
    await stopEmbeddedMongo();
  } catch (e: any) {
    console.warn('[main] exit: mongo shutdown error:', e?.message);
  }
  app.quit();
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    frame: false, // custom TitleBar owns min/max/exit (see renderer TitleBar.tsx)
    icon: app.isPackaged ? path.join(process.resourcesPath, 'assets', 'icon.ico') : path.join(app.getAppPath(), 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  registerIpc(() => mainWindow, { requestExit: (withBackup: boolean) => void gracefulExit(withBackup) });

  const sendMaxState = () => mainWindow?.webContents.send('win:maxState', mainWindow?.isMaximized() ?? false);
  mainWindow.on('maximize', sendMaxState);
  mainWindow.on('unmaximize', sendMaxState);

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  if (!app.isPackaged) {
    try {
      await mainWindow.loadURL(devUrl);
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    } catch {
      await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
    }
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => (mainWindow = null));
}

if (gotLock) {
  app.whenReady().then(async () => {
    // 1) Embedded MongoDB lifecycle: reuse a running instance on :27017,
    //    otherwise spawn the bundled mongod.exe and await socket readiness.
    try {
      const res = await ensureLocalMongo();
      console.log(`[main] mongo: ${res.message}`);
    } catch (e: any) {
      console.warn('[main] ensureLocalMongo failed:', e?.message);
    }

    // 2) Mongoose connection, then window + engines.
    await connectDb(getSettings().mongoUri).catch((e) => console.warn('[db]', e?.message));
    await createWindow();
    startSyncEngine(mainWindow);
    startBackupScheduler(); // silent daily snapshot, every 24h

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // Graceful embedded-DB shutdown before the process exits (no corruption).
  app.on('before-quit', (e) => {
    if (quitting || !isEmbeddedRunning()) return;
    e.preventDefault();
    quitting = true;
    void stopEmbeddedMongo()
      .catch((err) => console.warn('[main] mongo shutdown error:', err?.message))
      .finally(() => app.quit());
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
