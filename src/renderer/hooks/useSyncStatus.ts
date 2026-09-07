import { useEffect, useState } from 'react';
import { pos, unwrap } from '../lib/api';

export interface SyncState {
  ok: boolean;
  at: string | null;
  message: string;
  running: boolean;
}

export function useSyncStatus(pollMs = 10_000) {
  const [s, setS] = useState<SyncState>({ ok: false, at: null, message: '…', running: false });
  useEffect(() => {
    let alive = true;
    const fetch = async () => {
      try {
        const st = await unwrap<any>(pos().sync.status());
        if (alive) setS(st);
      } catch {}
    };
    fetch();
    const off = window.pos ? window.pos.sync.onStatus((st: any) => setS(st)) : () => {};
    const t = setInterval(fetch, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
      off?.();
    };
  }, [pollMs]);
  return s;
}
