import { useCallback, useEffect, useState } from 'react';
import { pos, unwrap } from '../lib/api';
import { PAGE_KEYS, LEGACY_PAGE_MAP } from '../../shared/types';

export interface Session {
  loggedIn: boolean;
  needsSetup: boolean;
  username?: string;
  role?: string;
  allowedPages?: string[];
}

const EMPTY: Session = { loggedIn: false, needsSetup: false };

export function useSession() {
  const [session, setSession] = useState<Session>(EMPTY);
  const refresh = useCallback(async () => {
    try {
      setSession((await unwrap(pos().auth.session())) as Session);
    } catch {
      /* bridge unavailable */
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { session, refresh };
}

/** Expand stored keys (canonical + legacy coarse keys) to canonical keys. */
export function expandPages(pages: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const k of pages || []) {
    if ((PAGE_KEYS as readonly string[]).includes(k)) out.add(k);
    for (const n of LEGACY_PAGE_MAP[k] || []) out.add(n);
  }
  return [...out];
}

/** RBAC: ADMIN sees everything; others see their allowedPages. */
export function canView(session: Session, key: string): boolean {
  if (!session.loggedIn) return false;
  if (session.role === 'ADMIN') return true;
  return expandPages(session.allowedPages).includes(key);
}
