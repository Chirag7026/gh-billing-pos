import bcrypt from 'bcryptjs';
import { getAdminHash, setAdminHash, isLoggedIn, setSession } from './config.js';

export async function needsSetup(): Promise<boolean> {
  return !getAdminHash();
}

export async function setupAdmin(usernameIgnored: string, password: string) {
  if (getAdminHash()) throw new Error('Already initialized');
  if (!password || password.length < 4) throw new Error('Password must be at least 4 characters');
  setAdminHash(await bcrypt.hash(password, 10));
  setSession(true);
  return { ok: true };
}

export async function login(password: string) {
  const hash = getAdminHash();
  if (!hash) throw new Error('Needs setup');
  const ok = await bcrypt.compare(password, hash);
  if (!ok) throw new Error('Invalid password');
  setSession(true);
  return { ok: true };
}

export function logout() {
  setSession(false);
  return { ok: true };
}

export async function changePassword(oldPass: string, newPass: string) {
  const hash = getAdminHash();
  if (!hash) throw new Error('Needs setup');
  const ok = await bcrypt.compare(oldPass, hash);
  if (!ok) throw new Error('Current password incorrect');
  if (!newPass || newPass.length < 4) throw new Error('New password too short');
  setAdminHash(await bcrypt.hash(newPass, 10));
  return { ok: true };
}

export function session() {
  return { loggedIn: isLoggedIn(), needsSetup: !getAdminHash() };
}
