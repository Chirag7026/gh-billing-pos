import { useCallback, useEffect, useState } from 'react';
import { pos, unwrap } from '../lib/api';

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

/** RBAC: ADMIN sees everything; others see their allowedPages. */
export function canView(session: Session, key: string): boolean {
  if (!session.loggedIn) return false;
  if (session.role === 'ADMIN') return true;
  return (session.allowedPages || []).includes(key);
}
