import bcrypt from 'bcryptjs';
import { getAdminHash, setAdminHash, setSession, getSessionUser } from './config.js';
import { User } from './models/index.js';
import { PAGE_KEYS } from '../shared/types.js';

const ALL_PAGES = [...PAGE_KEYS];

/** One-time V1 migration: legacy single adminHash → users.ADMIN. */
async function ensureMigrated() {
  try {
    const n = await User.countDocuments();
    if (n === 0) {
      const legacy = getAdminHash();
      if (legacy) {
        await User.create({ username: 'ADMIN', passwordHash: legacy, role: 'ADMIN', allowedPages: ALL_PAGES, isActive: true });
        setAdminHash('' as any);
      }
    }
  } catch {
    /* db unavailable — caller surfaces */
  }
}

export async function needsSetup(): Promise<boolean> {
  await ensureMigrated();
  return (await User.countDocuments()) === 0;
}

export async function setupAdmin(username: string, password: string) {
  await ensureMigrated();
  if ((await User.countDocuments()) > 0) throw new Error('Already initialized');
  const name = (username || 'ADMIN').trim().toUpperCase();
  if (!name) throw new Error('Username required');
  if (!password || password.length < 4) throw new Error('Password must be at least 4 characters');
  await User.create({ username: name, passwordHash: await bcrypt.hash(password, 10), role: 'ADMIN', allowedPages: ALL_PAGES, isActive: true });
  setSession({ username: name, role: 'ADMIN' });
  return { ok: true };
}

export async function login(username: string, password: string) {
  await ensureMigrated();
  const name = (username || '').trim().toUpperCase();
  const u: any = await User.findOne({ username: name }).lean();
  if (!u) throw new Error('Unknown user');
  if (!u.isActive) throw new Error('User is disabled');
  const ok = await bcrypt.compare(password || '', u.passwordHash);
  if (!ok) throw new Error('Invalid password');
  setSession({ username: u.username, role: u.role });
  return { ok: true, username: u.username, role: u.role, allowedPages: u.allowedPages };
}

/** Logout / Switch User: clears the app session only — MongoDB keeps running. */
export function logout() {
  setSession(null);
  return { ok: true };
}

export async function changePassword(username: string, oldPass: string, newPass: string) {
  const sess = getSessionUser();
  const name = ((username || sess?.username || '') as string).toUpperCase();
  const u: any = await User.findOne({ username: name });
  if (!u) throw new Error('Unknown user');
  // Non-admins may only change their own password (with current password check)
  if (sess?.role !== 'ADMIN' && sess?.username !== name) throw new Error('Not permitted');
  const ok = await bcrypt.compare(oldPass || '', u.passwordHash);
  if (!ok) throw new Error('Current password incorrect');
  if (!newPass || newPass.length < 4) throw new Error('New password too short');
  u.passwordHash = await bcrypt.hash(newPass, 10);
  await u.save();
  return { ok: true };
}

export async function session() {
  await ensureMigrated().catch(() => undefined);
  const s = getSessionUser();
  const setup = await needsSetup().catch(() => false);
  if (!s) return { loggedIn: false, needsSetup: setup };
  const u: any = await User.findOne({ username: s.username }).lean().catch(() => null);
  if (!u || !u.isActive) {
    setSession(null);
    return { loggedIn: false, needsSetup: setup };
  }
  return { loggedIn: true, needsSetup: false, username: u.username, role: u.role, allowedPages: u.allowedPages || [] };
}

export function currentRole(): string | null {
  return getSessionUser()?.role ?? null;
}

// ---------------- user management (ADMIN only, enforced in IPC) ----------------
export async function listUsers() {
  const rows = await User.find({}).sort({ username: 1 }).lean();
  return rows.map((u: any) => ({ _id: String(u._id), username: u.username, role: u.role, allowedPages: u.allowedPages || [], isActive: u.isActive }));
}

export async function createUser(p: { username: string; password: string; role: string; allowedPages?: string[] }) {
  const name = (p.username || '').trim().toUpperCase();
  if (!name) throw new Error('Username required');
  if (!p.password || p.password.length < 4) throw new Error('Password must be at least 4 characters');
  if (!['ADMIN', 'OPERATOR', 'CASHIER'].includes(p.role)) throw new Error('Invalid role');
  const pages = (p.allowedPages || []).filter((k) => (ALL_PAGES as string[]).includes(k));
  try {
    await User.create({ username: name, passwordHash: await bcrypt.hash(p.password, 10), role: p.role, allowedPages: pages, isActive: true });
  } catch (e: any) {
    if (String(e?.message || '').includes('duplicate')) throw new Error(`User ${name} already exists`);
    throw e;
  }
  return { ok: true };
}

export async function updateUser(id: string, p: { role?: string; allowedPages?: string[]; isActive?: boolean; password?: string }) {
  const u: any = await User.findById(id);
  if (!u) throw new Error('User not found');
  if (p.role) {
    if (!['ADMIN', 'OPERATOR', 'CASHIER'].includes(p.role)) throw new Error('Invalid role');
    u.role = p.role;
  }
  if (p.allowedPages) u.allowedPages = p.allowedPages.filter((k) => (ALL_PAGES as string[]).includes(k));
  if (p.isActive !== undefined) {
    if (u.role === 'ADMIN' && p.isActive === false) {
      const others = await User.countDocuments({ role: 'ADMIN', isActive: true, _id: { $ne: u._id } });
      if (others === 0) throw new Error('Cannot disable the last active ADMIN');
    }
    u.isActive = p.isActive;
  }
  if (p.password) {
    if (p.password.length < 4) throw new Error('Password too short');
    u.passwordHash = await bcrypt.hash(p.password, 10);
  }
  await u.save();
  return { ok: true };
}
