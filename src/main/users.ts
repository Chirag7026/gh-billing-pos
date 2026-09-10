/**
 * users — user account data-access layer (RBAC store).
 *
 * Owns all reads/writes against the `users` collection: listing (hashes never
 * leave this module), creation, updates, and activation. Session handling
 * stays in auth.ts; ADMIN-only enforcement happens in ipc.ts handlers.
 * Accepts both canonical page keys and legacy coarse keys (dashboard,
 * billing, products, purchase, accounts, stock, reports, users, settings).
 */
import bcrypt from 'bcryptjs';
import { User } from './models/index.js';
import { PAGE_KEYS, LEGACY_PAGE_KEYS } from '../shared/types.js';

export const USER_ROLES = ['ADMIN', 'OPERATOR', 'CASHIER'] as const;

const KNOWN_PAGES = new Set<string>([...(PAGE_KEYS as readonly string[]), ...(LEGACY_PAGE_KEYS as readonly string[])]);

function cleanPages(pages: string[] | undefined): string[] {
  return (pages || []).filter((k) => KNOWN_PAGES.has(k));
}

function cleanRole(role: string): string {
  if (!(USER_ROLES as readonly string[]).includes(role)) throw new Error('Invalid role (use ADMIN, OPERATOR or CASHIER)');
  return role;
}

export interface UserRow {
  _id: string;
  username: string;
  role: string;
  allowedPages: string[];
  canEditReceipt: boolean;
  canDeleteReceipt: boolean;
  isActive: boolean;
}

export async function listUsers(): Promise<UserRow[]> {
  const rows = await User.find({}).sort({ username: 1 }).lean();
  return rows.map((u: any) => ({
    _id: String(u._id),
    username: u.username,
    role: u.role,
    allowedPages: u.allowedPages || [],
    canEditReceipt: u.canEditReceipt !== false,
    canDeleteReceipt: u.canDeleteReceipt !== false,
    isActive: u.isActive
  }));
}

export async function createUser(p: { username: string; password: string; role: string; allowedPages?: string[]; canEditReceipt?: boolean; canDeleteReceipt?: boolean }) {
  const name = (p.username || '').trim().toUpperCase();
  if (!name) throw new Error('Username required');
  if (!p.password || p.password.length < 4) throw new Error('Password must be at least 4 characters');
  try {
    await User.create({
      username: name,
      passwordHash: await bcrypt.hash(p.password, 10),
      role: cleanRole(p.role),
      allowedPages: cleanPages(p.allowedPages),
      canEditReceipt: p.canEditReceipt !== false,
      canDeleteReceipt: p.canDeleteReceipt !== false,
      isActive: true
    });
  } catch (e: any) {
    if (String(e?.message || '').includes('duplicate')) throw new Error(`User ${name} already exists`);
    throw e;
  }
  return { ok: true };
}

export async function updateUser(
  id: string,
  p: { role?: string; allowedPages?: string[]; canEditReceipt?: boolean; canDeleteReceipt?: boolean; isActive?: boolean; password?: string }
) {
  const u: any = await User.findById(id);
  if (!u) throw new Error('User not found');
  if (p.role) u.role = cleanRole(p.role);
  if (p.allowedPages) u.allowedPages = cleanPages(p.allowedPages);
  if (p.canEditReceipt !== undefined) u.canEditReceipt = !!p.canEditReceipt;
  if (p.canDeleteReceipt !== undefined) u.canDeleteReceipt = !!p.canDeleteReceipt;
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
