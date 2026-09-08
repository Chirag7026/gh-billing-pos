import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pos, unwrap } from '../lib/api';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useSession } from '../hooks/useSession';
import { hasUnsaved, unsavedKeys } from '../lib/unsaved';

/**
 * V2 frameless-window title bar (32px).
 * Top-left: logo + title + live sync dot (green/amber/red).
 * Top-right: user badge + role, Switch User / Logout (session only —
 * MongoDB keeps running), Min / Max / Exit (#ef4444 hover).
 * Exit: unsaved-bill guard → "Backup database before closing?"
 * ([Quick Backup & Exit] / [Exit Without Backup] / [Cancel]).
 */
export default function TitleBar() {
  const [maxed, setMaxed] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [backupAsk, setBackupAsk] = useState(false);
  const [busy, setBusy] = useState('');
  const nav = useNavigate();
  const sync = useSyncStatus(10_000);
  const { session, refresh } = useSession();
  const bridged = typeof window !== 'undefined' && !!(window as any).pos;

  useEffect(() => {
    if (!bridged) return;
    pos()
      .win.isMaximized()
      .then((r: any) => setMaxed(!!r?.data?.maximized))
      .catch(() => undefined);
    return pos().win.onMaxState(setMaxed);
  }, [bridged]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const dot = !bridged ? 'bg-slate-500' : sync.ok ? 'bg-emerald-400' : /fail|error/i.test(sync.message) ? 'bg-red-500' : 'bg-amber-400 animate-pulse';

  const exit = async (withBackup: boolean) => {
    if (!bridged) return;
    setUnsavedOpen(false);
    setBackupAsk(false);
    setBusy(withBackup ? 'Quick backup, syncing and shutting down…' : 'Syncing and shutting down…');
    try {
      await unwrap(pos().app.exit(withBackup));
      setTimeout(() => setBusy(''), 30_000);
    } catch (e: any) {
      setBusy('');
      alert(`Exit failed: ${e?.message || e}`);
    }
  };

  const onExitClick = () => {
    if (hasUnsaved()) setUnsavedOpen(true);
    else setBackupAsk(true);
  };

  const logout = async (switchUser: boolean) => {
    try {
      if (bridged) await unwrap(pos().auth.logout());
    } catch {}
    void switchUser;
    nav('/login');
  };

  return (
    <>
      <div className="drag fixed top-0 left-0 right-0 h-8 z-50 flex items-center bg-slate-900/95 border-b border-slate-800 pl-3 select-none">
        <span className="text-[11px] font-bold tracking-[0.2em] text-slate-300">
          G H <span className="text-slate-500 font-normal tracking-normal">· GH Billing POS</span>
        </span>
        <span title={sync.message} className={`ml-3 w-2.5 h-2.5 rounded-full ${dot}`} />
        <div className="no-drag fixed top-0 right-0 z-50 flex h-8 items-center gap-1 pr-1">
          {session.loggedIn && (
            <>
              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono" title={session.username}>
                {session.username} · {session.role}
              </span>
              <button onClick={() => void logout(true)} className="text-[11px] px-2 h-6 rounded bg-slate-800 hover:bg-slate-700" title="Switch User">
                Switch User
              </button>
              <button onClick={() => void logout(false)} className="text-[11px] px-2 h-6 rounded bg-slate-800 hover:bg-slate-700" title="Logout">
                Logout
              </button>
            </>
          )}
          <button
            onClick={() => bridged && pos().win.minimize()}
            className="w-11 h-8 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="Minimize"
          >
            _
          </button>
          <button
            onClick={async () => {
              if (!bridged) return;
              try {
                const r: any = await unwrap(pos().win.toggleMaximize());
                setMaxed(!!r?.maximized);
              } catch {}
            }}
            className="w-11 h-8 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors text-xs"
            title={maxed ? 'Restore' : 'Maximize'}
          >
            {maxed ? '❐' : '□'}
          </button>
          <button onClick={onExitClick} className="w-11 h-8 text-slate-300 hover:bg-[#ef4444] hover:text-white transition-colors" title="Exit">
            ✕
          </button>
        </div>
      </div>

      {unsavedOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="card w-full max-w-md">
            <h2 className="font-bold text-lg text-amber-300">Unsaved bill open</h2>
            <p className="text-sm text-slate-300 mt-2">
              Active unsaved bill/invoice ({unsavedKeys().join(', ') || 'draft'}). Continuing will discard it.
            </p>
            <div className="flex gap-2 mt-4">
              <button className="btn-danger" onClick={() => { setUnsavedOpen(false); setBackupAsk(true); }}>
                Discard & Continue
              </button>
              <button className="btn-ghost" onClick={() => setUnsavedOpen(false)}>
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {backupAsk && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="card w-full max-w-md">
            <h2 className="font-bold text-lg">Backup database before closing?</h2>
            <p className="text-sm text-slate-400 mt-1">Sync flushes first either way; MongoDB stops cleanly after.</p>
            <div className="flex gap-2 mt-4 flex-wrap">
              <button className="btn-primary" onClick={() => void exit(true)}>
                Quick Backup & Exit
              </button>
              <button className="btn-ghost" onClick={() => void exit(false)}>
                Exit Without Backup
              </button>
              <button className="btn-ghost" onClick={() => setBackupAsk(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {busy && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center">
          <div className="text-sm text-slate-200 animate-pulse">{busy}</div>
        </div>
      )}
    </>
  );
}
