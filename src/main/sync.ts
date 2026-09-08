import axios from 'axios';
import { BrowserWindow } from 'electron';
import { Product, Sale, Purchase, Ledger, SyncState } from './models/index.js';
import { getSettings } from './config.js';

let timer: NodeJS.Timeout | null = null;
let running = false;
let paused = false; // restore / shutdown windows pause the 10s interval
let lastStatus: { ok: boolean; at: string | null; message: string } = { ok: false, at: null, message: 'Not synced yet' };

export function syncStatus() {
  return { ...lastStatus, running, paused, intervalMs: syncIntervalMs() };
}

async function getLastSync(key: string): Promise<Date | null> {
  const s = (await SyncState.findOne({ key }).lean()) as any;
  return (s?.lastSyncAt as Date) ?? null;
}
async function setLastSync(key: string, d: Date) {
  await SyncState.findOneAndUpdate({ key }, { $set: { lastSyncAt: d } }, { upsert: true });
}

/**
 * Differential sync: push local docs with updatedAt > lastSync, pull remote
 * changes via GET ?since=ISO. Remote is a generic REST API:
 *   POST {endpoint}/push { products, sales, purchases, ledgers }
 *   GET  {endpoint}/pull?since=ISO -> same shape
 * Bearer token from settings. Failures are recorded, never thrown.
 */
async function cycle(mainWindow: BrowserWindow | null) {
  if (running || paused) return;
  const s = getSettings();
  if (!s.syncEnabled || !s.syncEndpoint) return;
  running = true;
  try {
    const last = (await getLastSync('global')) ?? new Date(0);
    const since = last.toISOString();
    const [products, sales, purchases, ledgers] = await Promise.all([
      Product.find({ updatedAt: { $gt: last } }).limit(2000).lean(),
      Sale.find({ updatedAt: { $gt: last } }).limit(2000).lean(),
      Purchase.find({ updatedAt: { $gt: last } }).limit(2000).lean(),
      Ledger.find({ updatedAt: { $gt: last } }).limit(2000).lean()
    ]);
    const headers = s.syncToken ? { Authorization: `Bearer ${s.syncToken}` } : {};
    const base = s.syncEndpoint.replace(/\/+$/, '');

    if (products.length || sales.length || purchases.length || ledgers.length) {
      await axios.post(`${base}/push`, { since, products, sales, purchases, ledgers }, { headers, timeout: 15000 });
    }
    let pulled = 0;
    try {
      const res = await axios.get(`${base}/pull`, { params: { since }, headers, timeout: 15000 });
      const d = res.data || {};
      pulled = await applyPull(d);
    } catch (e: any) {
      // Pull is optional if server only accepts pushes
      if (e?.response?.status !== 404) throw e;
    }
    const now = new Date();
    await setLastSync('global', now);
    lastStatus = {
      ok: true,
      at: now.toISOString(),
      message: `Synced ${products.length + sales.length + purchases.length + ledgers.length} up / ${pulled} down`
    };
  } catch (e: any) {
    lastStatus = { ok: false, at: lastStatus.at, message: String(e?.response?.data?.message || e?.message || e) };
  } finally {
    running = false;
    mainWindow?.webContents.send('sync:status', syncStatus());
  }
}

async function applyPull(d: any): Promise<number> {
  let n = 0;
  const upsert = async (M: any, rows: any[], key: string) => {
    for (const r of rows || []) {
      const { _id, ...rest } = r;
      await M.findOneAndUpdate({ [key]: (r as any)[key] }, { $set: rest }, { upsert: true });
      n++;
    }
  };
  await upsert(Product, d.products, 'barcode');
  await upsert(Ledger, d.ledgers, 'accountName');
  await upsert(Sale, d.sales, 'billNo');
  for (const r of d.purchases || []) {
    const { _id, ...rest } = r;
    await Purchase.findOneAndUpdate(
      { purchaseBillNo: (r as any).purchaseBillNo, supplierName: (r as any).supplierName },
      { $set: rest },
      { upsert: true }
    );
    n++;
  }
  return n;
}

/** Admin-configurable interval, default 10s, clamped to 5–300s. */
export function syncIntervalMs(): number {
  const s = Math.round(Number(getSettings().syncIntervalSec) || 10);
  return Math.min(300, Math.max(5, s)) * 1000;
}

export function startSyncEngine(mainWindow: BrowserWindow | null, intervalMs?: number) {
  stopSyncEngine();
  const ms = intervalMs ?? syncIntervalMs();
  // Immediate first cycle (async, non-blocking)
  setImmediate(() => cycle(mainWindow));
  timer = setInterval(() => cycle(mainWindow), ms);
}

export function stopSyncEngine() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Temporarily halt the 10s interval (e.g. during database restore). */
export function pauseSync() {
  paused = true;
  if (timer) clearInterval(timer);
  timer = null;
}

export function resumeSync(mainWindow: BrowserWindow | null, intervalMs = 10_000) {
  paused = false;
  startSyncEngine(mainWindow, intervalMs);
}

export function isSyncPaused() {
  return paused;
}

export async function syncNow(mainWindow: BrowserWindow | null) {
  await cycle(mainWindow);
  return syncStatus();
}
