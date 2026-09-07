import { useEffect, useState } from 'react';
import { pos, unwrap } from '../lib/api';
import { hasUnsaved, unsavedKeys } from '../lib/unsaved';

/**
 * Custom frameless-window title bar. Controls are anchored
 * `fixed top-0 right-0 z-50`; the bar itself is the drag region.
 * ✕ flow: unsaved bill → safety modal; confirm → main runs
 * sync flush → snapshot backup → mongod stop → app.quit().
 */
export default function TitleBar() {
  const [maxed, setMaxed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState('');
  const bridged = typeof window !== 'undefined' && !!(window as any).pos;

  useEffect(() => {
    if (!bridged) return;
    pos()
      .win.isMaximized()
      .then((r: any) => setMaxed(!!r?.data?.maximized))
      .catch(() => undefined);
    return pos().win.onMaxState(setMaxed);
  }, [bridged]);

  const exit = async () => {
    if (!bridged) return;
    setConfirming(false);
    setBusy('Syncing, backing up and shutting down…');
    try {
      await unwrap(pos().app.exit());
      // Main quits asynchronously; keep the veil until the window closes.
      setTimeout(() => setBusy(''), 30_000);
    } catch (e: any) {
      setBusy('');
      alert(`Exit failed: ${e?.message || e}`);
    }
  };

  const onExitClick = () => {
    if (hasUnsaved()) setConfirming(true);
    else void exit();
  };

  const dirtyList = unsavedKeys().join(', ');

  return (
    <>
      <div className="drag fixed top-0 left-0 right-0 h-8 z-50 flex items-center bg-slate-900/95 border-b border-slate-800 pl-3 select-none">
        <span className="text-[11px] font-bold tracking-[0.2em] text-slate-300">
          G H <span className="text-slate-500 font-normal tracking-normal">· GH Billing POS</span>
        </span>
        <div className="no-drag fixed top-0 right-0 z-50 flex h-8">
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
          <button
            onClick={onExitClick}
            className="w-11 h-8 text-slate-300 hover:bg-[#ef4444] hover:text-white transition-colors"
            title="Exit"
          >
            ✕
          </button>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="card w-full max-w-md">
            <h2 className="font-bold text-lg text-amber-300">Unsaved bill open</h2>
            <p className="text-sm text-slate-300 mt-2">
              You have an active unsaved bill/invoice ({dirtyList || 'draft'}). Exiting now will discard it.
              The app will still flush sync, take a snapshot backup and stop the database cleanly.
            </p>
            <div className="flex gap-2 mt-4">
              <button className="btn-danger" onClick={() => void exit()}>
                Discard & Exit
              </button>
              <button className="btn-ghost" onClick={() => setConfirming(false)}>
                Keep editing
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
