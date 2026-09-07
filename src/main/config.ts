import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { app } from 'electron';
import { AppSettings, DEFAULT_SETTINGS } from '../shared/types.js';

interface StoreShape { settings: AppSettings; adminHash: string | null; session: boolean; }

function storePath(): string {
  try {
    return path.join(app.getPath('userData'), 'gh-pos-config.json');
  } catch {
    return path.join(os.tmpdir(), 'gh-pos-config.json');
  }
}

function readStore(): StoreShape {
  const fb: StoreShape = { settings: DEFAULT_SETTINGS, adminHash: null, session: false };
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return fb;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) }, adminHash: raw.adminHash ?? null, session: !!raw.session };
  } catch {
    return fb;
  }
}

function writeStore(s: StoreShape) {
  try {
    const p = storePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(s, null, 2), 'utf8');
  } catch (e) {
    console.warn('[config] write failed', e);
  }
}

export function getSettings(): AppSettings {
  return readStore().settings;
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const cur = readStore();
  const next = { ...cur, settings: { ...cur.settings, ...patch } };
  writeStore(next);
  return next.settings;
}

export function getAdminHash(): string | null {
  return readStore().adminHash;
}
export function setAdminHash(hash: string) {
  const cur = readStore();
  writeStore({ ...cur, adminHash: hash });
}
export function isLoggedIn(): boolean {
  return readStore().session;
}
export function setSession(v: boolean) {
  const cur = readStore();
  writeStore({ ...cur, session: v });
}
