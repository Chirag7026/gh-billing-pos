import { pos, unwrap } from './api';

// Cached settings snapshot (5s TTL) for hot paths: beep duration, print toggles.
let cache: any = null;
let at = 0;

export async function prefs(): Promise<any> {
  const now = Date.now();
  if (!cache || now - at > 5000) {
    try {
      cache = await unwrap(pos().settings.get());
    } catch {
      cache = cache || {};
    }
    at = now;
  }
  return cache;
}

export async function beepSeconds(): Promise<number> {
  const p = await prefs();
  return Number(p.beepDurationSec) || 1.5;
}
