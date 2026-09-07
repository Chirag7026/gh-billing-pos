/**
 * dbManager — embedded portable MongoDB lifecycle for production builds.
 *
 * - Locates the bundled `mongod.exe` in dev (`resources/bin/`) and in the
 *   packaged app (`process.resourcesPath/bin/` via extraResources).
 * - If nothing listens on 127.0.0.1:27017, spawns the bundled binary with
 *   `--dbpath %APPDATA%/billing_pos/db_data` (created automatically).
 * - Waits for socket readiness before Mongoose connects / window loads.
 * - Shuts the child down cleanly (`--shutdown`, then SIGINT/SIGTERM) so the
 *   data files are never left in a dirty state.
 */
import { app } from 'electron';
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';

export const MONGO_PORT = 27017;
export const MONGO_HOST = '127.0.0.1';

let child: ChildProcess | null = null;
let owned = false;

export function isEmbeddedRunning(): boolean {
  return owned && child !== null && child.exitCode === null && !child.killed;
}

/** Persistent storage: %APPDATA%/billing_pos/db_data (+ mongod.log beside it). */
export function dataPaths(): { dbPath: string; logPath: string } {
  const base = path.join(app.getPath('appData'), 'billing_pos');
  return { dbPath: path.join(base, 'db_data'), logPath: path.join(base, 'mongod.log') };
}

/** Resolve the portable binary across dev and packaged layouts. */
export function resolveMongodBinary(): string | null {
  const candidates: string[] = [];
  if (app.isPackaged) {
    // extraResources [{ from: resources/bin/mongod.exe, to: bin/mongod.exe }]
    candidates.push(path.join(process.resourcesPath, 'bin', 'mongod.exe'));
  } else {
    candidates.push(
      path.join(app.getAppPath(), 'resources', 'bin', 'mongod.exe'),
      path.join(process.cwd(), 'resources', 'bin', 'mongod.exe')
    );
  }
  // A system-wide mongod on PATH is an acceptable last resort.
  const pathEnv = (process.env.PATH || '').split(path.delimiter);
  for (const dir of pathEnv) {
    if (dir) candidates.push(path.join(dir, 'mongod.exe'));
  }
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** True when something already accepts connections on 127.0.0.1:27017. */
export function isMongoUp(timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      resolve(v);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    try {
      sock.connect(MONGO_PORT, MONGO_HOST);
    } catch {
      finish(false);
    }
  });
}

async function waitForReady(timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isMongoUp(800)) return true;
    if (child && child.exitCode !== null) return false; // child died — check log
    await new Promise((r) => setTimeout(r, 500));
  }
  return isMongoUp(1000);
}

export interface EnsureResult {
  mode: 'external' | 'embedded' | 'unavailable';
  binary: string | null;
  dbPath: string;
  message: string;
}

/**
 * Ensure a local MongoDB is reachable before the app connects.
 * 1. Port already open  -> use it (external/service), spawn nothing.
 * 2. Port closed + bundled mongod.exe found -> spawn it, await readiness.
 * 3. Otherwise -> 'unavailable' (UI surfaces the error via db:connect).
 */
export async function ensureLocalMongo(): Promise<EnsureResult> {
  const { dbPath, logPath } = dataPaths();

  if (await isMongoUp()) {
    return { mode: 'external', binary: null, dbPath, message: `MongoDB already running on ${MONGO_HOST}:${MONGO_PORT}` };
  }

  const binary = resolveMongodBinary();
  if (!binary) {
    return {
      mode: 'unavailable',
      binary: null,
      dbPath,
      message: `No MongoDB on port ${MONGO_PORT} and no bundled mongod.exe found. Install MongoDB or place mongod.exe in resources/bin/.`
    };
  }

  fs.mkdirSync(dbPath, { recursive: true });

  const args = [
    '--port', String(MONGO_PORT),
    '--dbpath', dbPath,
    '--bind_ip', MONGO_HOST,
    '--logpath', logPath
  ];
  console.log(`[dbManager] spawning ${binary} ${args.join(' ')}`);
  child = spawn(binary, args, { windowsHide: true, stdio: 'ignore' });
  owned = true;
  child.once('error', (e) => console.error('[dbManager] mongod spawn error:', e?.message));
  child.once('exit', (code, sig) => {
    console.log(`[dbManager] mongod exited code=${code} signal=${sig}`);
    if (owned) {
      child = null;
      owned = false;
    }
  });

  const ready = await waitForReady();
  if (ready) {
    return { mode: 'embedded', binary, dbPath, message: `Embedded mongod ready (dbpath=${dbPath})` };
  }
  await stopEmbeddedMongo().catch(() => undefined);
  return {
    mode: 'unavailable',
    binary,
    dbPath,
    message: `Bundled mongod failed to become ready within 30s. See ${logPath}.`
  };
}

/**
 * Clean shutdown: `mongod --shutdown` against our dbpath (safe on Windows
 * where SIGINT is forceful), then SIGINT/SIGTERM on the handle, then SIGKILL.
 */
export async function stopEmbeddedMongo(timeoutMs = 15_000): Promise<void> {
  if (!owned && !child) return;
  const binary = resolveMongodBinary();
  const { dbPath } = dataPaths();

  // 1) Graceful admin shutdown via a short-lived mongod invocation.
  try {
    if (binary) {
      const r = spawnSync(binary, ['--dbpath', dbPath, '--shutdown'], { timeout: 10_000, windowsHide: true });
      if (r.status === 0) console.log('[dbManager] mongod --shutdown OK');
    }
  } catch (e: any) {
    console.warn('[dbManager] --shutdown failed:', e?.message);
  }

  const proc = child;
  if (!proc || proc.exitCode !== null) {
    child = null;
    owned = false;
    return;
  }

  // 2) Polite signal, escalating to force-kill.
  const exited = new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      try {
        if (proc.exitCode === null) proc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          if (proc.exitCode === null) proc.kill('SIGKILL' as NodeJS.Signals);
        } catch {
          /* ignore */
        }
        resolve();
      }, 3000);
    }, Math.max(1000, timeoutMs - 4000));
    proc.once('exit', () => {
      clearTimeout(t);
      resolve();
    });
    try {
      proc.kill('SIGINT');
    } catch {
      /* ignore */
    }
  });
  await exited;
  child = null;
  owned = false;
}
