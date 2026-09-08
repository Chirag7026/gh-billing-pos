/**
 * backup — automated database backup & restore engine.
 *
 * - Tools: portable `mongodump.exe` / `mongorestore.exe` bundled in
 *   resources/bin/ (extraResources → bin/), PATH fallback, dev fallback.
 * - Format: `backup_YYYY-MM-DD_HH-mm-ss.tar.gz` (mongodump --out + tar -czf).
 * - Storage: %APPDATA%/billing_pos/backups/ or custom Settings path
 *   (USB drive, OneDrive / Google Drive folder, local disk).
 * - Retention: last 30 archives kept, older pruned automatically.
 * - Triggers: daily scheduler (24h), on-exit snapshot, manual button.
 * - Restore: tar -xzf → mongorestore --drop --db billing_pos, with
 *   before/after record counts for verification.
 */
import { app } from 'electron';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getSettings } from './config.js';
import { isMongoUp, MONGO_HOST, MONGO_PORT } from './dbManager.js';
import { connectDb } from './db.js';
import { Product, Ledger, Sale, Purchase } from './models/index.js';

export const BACKUP_RETENTION = 30;
export const BACKUP_PATTERN = /^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.tar\.gz$/;

let scheduler: NodeJS.Timeout | null = null;

export interface BackupInfo {
  name: string;
  path: string;
  dest: string; // 'A' | 'B'
  date: string; // display date parsed from filename
  size: number;
  status: 'Ready' | 'Empty' | 'Corrupt';
}

export interface DbCounts {
  products: number;
  ledgers: number;
  sales: number;
  purchases: number;
}

/** Backup roots: Destination A (default %APPDATA%/billing_pos/backups/) + optional B (USB/drive/share). */
export function backupDirs(): { tag: string; dir: string }[] {
  const s = getSettings();
  const customA = (s.backupPath || '').trim();
  const customB = ((s as any).backupPathB || '').trim();
  const defA = path.join(app.getPath('appData'), 'billing_pos', 'backups');
  const dirs = [{ tag: 'A', dir: customA || defA }];
  if (customB) dirs.push({ tag: 'B', dir: customB });
  for (const d of dirs) fs.mkdirSync(d.dir, { recursive: true });
  return dirs;
}

/** Legacy single-dir accessor (Destination A). */
export function backupDir(): string {
  return backupDirs()[0].dir;
}

/** Resolve a bundled mongo tool across packaged / dev / PATH layouts. */
export function resolveTool(name: 'mongodump' | 'mongorestore'): string | null {
  const file = `${name}.exe`;
  const candidates: string[] = [];
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'bin', file));
  } else {
    candidates.push(
      path.join(app.getAppPath(), 'resources', 'bin', file),
      path.join(process.cwd(), 'resources', 'bin', file)
    );
  }
  const pathEnv = (process.env.PATH || '').split(path.delimiter);
  for (const dir of pathEnv) {
    if (dir) candidates.push(path.join(dir, file));
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

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function displayDate(name: string): string {
  const m = /^backup_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.tar\.gz$/.exec(name);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}` : name;
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${path.basename(cmd)} failed: ${String((err as any)?.message || err)}\n${String(stderr || '').slice(0, 2000)}`));
      else resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function ensureDb() {
  const r = await connectDb();
  if (!r.ok) throw new Error(`MongoDB unavailable at ${r.uri}: ${r.error}`);
}

export async function dbCounts(): Promise<DbCounts> {
  await ensureDb();
  const [products, ledgers, sales, purchases] = await Promise.all([
    Product.estimatedDocumentCount(),
    Ledger.estimatedDocumentCount(),
    Sale.estimatedDocumentCount(),
    Purchase.estimatedDocumentCount()
  ]);
  return { products, ledgers, sales, purchases };
}

/**
 * Create a snapshot: mongodump --db billing_pos → tar -czf archive,
 * written simultaneously to Destination A and (if configured) B.
 * Prunes each destination to the retention window before returning.
 */
export async function createBackup(
  reason = 'manual'
): Promise<{ file: string; name: string; size: number; dests: { tag: string; file: string; size: number }[] }> {
  if (!(await isMongoUp())) throw new Error('MongoDB is not running on 127.0.0.1:27017');
  const dump = resolveTool('mongodump');
  if (!dump) throw new Error('mongodump.exe not found (resources/bin/ or PATH). Run scripts/download-mongo-tools.ps1.');
  const dirs = backupDirs();
  const name = `backup_${stamp()}.tar.gz`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-dump-'));
  try {
    await run(dump, ['--host', MONGO_HOST, '--port', String(MONGO_PORT), '--db', 'billing_pos', '--out', tmp], 300_000);
    // Archive contains top-level billing_pos/*.bson (+ .metadata.json)
    const dumpSrc = path.join(tmp, 'billing_pos');
    const dests: { tag: string; file: string; size: number }[] = [];
    for (const d of dirs) {
      const file = path.join(d.dir, name);
      await run('tar', ['-czf', file, '-C', tmp, 'billing_pos'], 300_000);
      dests.push({ tag: d.tag, file, size: fs.statSync(file).size });
      pruneBackups(BACKUP_RETENTION, d.dir);
    }
    void dumpSrc;
    console.log(`[backup] ${reason} snapshot → ${dests.map((d) => `${d.tag}:${d.file}`).join(' + ')}`);
    return { file: dests[0].file, name, size: dests[0].size, dests };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** List local archives across all destinations, newest first. */
export function listBackups(): BackupInfo[] {
  let dirs: { tag: string; dir: string }[];
  try {
    dirs = backupDirs();
  } catch {
    return [];
  }
  const out: BackupInfo[] = [];
  for (const d of dirs) {
    let entries: string[];
    try {
      entries = fs.readdirSync(d.dir);
    } catch {
      continue;
    }
    for (const name of entries.filter((n) => BACKUP_PATTERN.test(n))) {
      const p = path.join(d.dir, name);
      let size = 0;
      try {
        size = fs.statSync(p).size;
      } catch {
        continue;
      }
      out.push({ name, path: p, dest: d.tag, date: displayDate(name), size, status: size > 0 ? 'Ready' : ('Empty' as const) });
    }
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** Retain the newest `keep` archives in `dir`, purge older ones. Returns removed count. */
export function pruneBackups(keep = BACKUP_RETENTION, dir?: string): number {
  const root = dir || backupDir();
  const all = listBackups().filter((b) => path.dirname(b.path) === root);
  let removed = 0;
  for (const b of all.slice(keep)) {
    try {
      fs.rmSync(b.path, { force: true });
      removed++;
    } catch {
      /* ignore */
    }
  }
  if (removed) console.log(`[backup] pruned ${removed} archive(s) in ${root}, kept ${keep}`);
  return removed;
}

/** Newest Ready snapshot across all destinations (for startup auto-restore). */
export function latestValidSnapshot(): BackupInfo | null {
  return listBackups().find((b) => b.status === 'Ready') ?? null;
}

/**
 * Startup integrity check: connect + verify core collections are readable.
 * Returns ok:false when data files are missing/corrupt so the UI can offer
 * auto-restore from the latest valid snapshot.
 */
export async function verifyIntegrity(): Promise<{ ok: boolean; counts?: any; error?: string; snapshot?: BackupInfo | null }> {
  try {
    const counts = await dbCounts();
    return { ok: true, counts, snapshot: latestValidSnapshot() };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e), snapshot: latestValidSnapshot() };
  }
}

function findDumpDir(extractRoot: string): string {
  const candidates = [
    path.join(extractRoot, 'billing_pos'),
    path.join(extractRoot, 'dump', 'billing_pos')
  ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isDirectory() && fs.readdirSync(c).some((f) => f.endsWith('.bson'))) return c;
    } catch {
      /* ignore */
    }
  }
  throw new Error('No billing_pos dump found in archive (expected billing_pos/*.bson).');
}

/**
 * Restore pipeline: extract archive → mongorestore --drop --db billing_pos.
 * Caller pauses the sync engine first and resumes + reloads afterwards.
 * Returns before/after record counts for verification.
 */
export async function restoreBackup(archivePath: string): Promise<{ before: DbCounts; after: DbCounts }> {
  if (!fs.existsSync(archivePath)) throw new Error(`Archive not found: ${archivePath}`);
  const restore = resolveTool('mongorestore');
  if (!restore) throw new Error('mongorestore.exe not found (resources/bin/ or PATH). Run scripts/download-mongo-tools.ps1.');
  if (!(await isMongoUp())) throw new Error('MongoDB is not running on 127.0.0.1:27017');
  const before = await dbCounts();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-restore-'));
  try {
    await run('tar', ['-xzf', archivePath, '-C', tmp], 300_000);
    const dumpDir = findDumpDir(tmp);
    await run(
      restore,
      ['--host', MONGO_HOST, '--port', String(MONGO_PORT), '--db', 'billing_pos', '--drop', dumpDir],
      600_000
    );
    console.log(`[backup] restored from ${archivePath}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const after = await dbCounts();
  return { before, after };
}

/** Daily silent scheduler (24h). No run at startup — only on interval. */
export function startBackupScheduler(intervalMs = 24 * 3600 * 1000) {
  stopBackupScheduler();
  scheduler = setInterval(() => {
    void createBackup('daily').catch((e) => console.warn('[backup] daily snapshot failed:', e?.message));
  }, intervalMs);
  if (scheduler.unref) scheduler.unref();
}

export function stopBackupScheduler() {
  if (scheduler) clearInterval(scheduler);
  scheduler = null;
}
