// Thin typed wrapper over window.pos (Electron preload). Falls back with a
// clear error when running in plain browser (vite dev without electron).
export function pos() {
  if (!window.pos) throw new Error('Electron bridge unavailable — run via Electron (npm run dev:all).');
  return window.pos;
}

export async function unwrap<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error || 'Request failed');
  return r.data as T;
}

export const inr = (n: number) =>
  (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
