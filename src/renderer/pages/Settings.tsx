import { useEffect, useState } from 'react';
import { pos, unwrap } from '../lib/api';

export default function Settings() {
  const [s, setS] = useState<any>({});
  const [printers, setPrinters] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [gate, setGate] = useState('');
  const [pw, setPw] = useState({ oldPass: '', newPass: '' });
  const [backups, setBackups] = useState<any[]>([]);
  const [backupDir, setBackupDir] = useState('');
  const [backupBusy, setBackupBusy] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<any | null>(null);
  const [restoreText, setRestoreText] = useState('');
  const [restoreResult, setRestoreResult] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      setS(await unwrap(pos().settings.get()).catch(() => ({})));
      setPrinters(await unwrap<string[]>(pos().printers.list()).catch(() => []));
    })();
  }, []);

  const refreshBackups = async () => {
    try {
      setBackups(await unwrap<any[]>(pos().backup.list()));
      const d: any = await unwrap(pos().backup.dir()).catch(() => null);
      if (d?.dir) setBackupDir(d.dir);
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  useEffect(() => {
    if (unlocked) refreshBackups();
  }, [unlocked]);

  const fmtMB = (b: number) => `${(Number(b) / 1048576).toFixed(1)} MB`;

  const manualBackup = async () => {
    setBackupBusy('Creating snapshot…');
    try {
      const r: any = await unwrap(pos().backup.now());
      setMsg(`Backup created: ${r.name} (${fmtMB(r.size)}). Last 30 kept.`);
      refreshBackups();
    } catch (e: any) {
      setMsg(`Backup failed: ${e.message}`);
    } finally {
      setBackupBusy('');
    }
  };

  const pickExternal = async () => {
    try {
      const d: any = await unwrap(pos().excel.dialog('open', [{ name: 'Backup archive', extensions: ['gz'] }]));
      if (!d.canceled && d.path) {
        setRestoreTarget({ path: d.path, name: String(d.path).split(/[\\/]/).pop(), date: 'external file', external: true });
        setRestoreText('');
        setRestoreResult(null);
      }
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const doRestore = async () => {
    if (!restoreTarget || restoreText !== 'RESTORE' || backupBusy) return;
    setBackupBusy('Pausing sync, restoring database…');
    try {
      await unwrap(pos().sync.pause());
      try {
        const r: any = await unwrap(pos().backup.restore(restoreTarget.path));
        setRestoreResult(r);
        setMsg(
          `Restored from ${restoreTarget.name}. Products ${r.before.products}→${r.after.products}, ` +
            `Ledgers ${r.before.ledgers}→${r.after.ledgers}, Sales ${r.before.sales}→${r.after.sales}, ` +
            `Purchases ${r.before.purchases}→${r.after.purchases}. Reload the app to refresh all screens.`
        );
      } finally {
        await unwrap(pos().sync.resume()).catch(() => undefined);
      }
      refreshBackups();
    } catch (e: any) {
      setMsg(`Restore failed: ${e.message}`);
    } finally {
      setBackupBusy('');
    }
  };

  const save = async () => {
    try {
      setS(await unwrap(pos().settings.save(s)));
      setMsg('Settings saved.');
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  const testDb = async () => {
    try {
      const r: any = await unwrap(pos().db.connect(s.mongoUri));
      setMsg(`MongoDB OK: ${r.uri}`);
    } catch (e: any) {
      setMsg(`MongoDB failed: ${e.message}`);
    }
  };
  const syncNow = async () => {
    try {
      const r: any = await unwrap(pos().sync.now());
      setMsg(`Sync: ${r.message}`);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-3">Settings & Hardware</h1>
      <div className="card grid grid-cols-2 gap-3 mb-3">
        <h2 className="col-span-2 font-bold">Database & Remote Sync</h2>
        <label className="col-span-2">MongoDB URI<input value={s.mongoUri || ''} onChange={(e) => setS({ ...s, mongoUri: e.target.value })} className="font-mono" /></label>
        {!unlocked ? (
          <div className="col-span-2 flex gap-2 items-end">
            <label className="flex-1">Admin password (to edit sync endpoint)<input type="password" value={gate} onChange={(e) => setGate(e.target.value)} /></label>
            <button className="btn-ghost" onClick={async () => { try { await unwrap(pos().auth.login(gate)); setUnlocked(true); setGate(''); } catch (e: any) { setMsg(e.message); } }}>Unlock</button>
          </div>
        ) : (
          <>
            <label className="col-span-2">Remote API Sync Endpoint<input value={s.syncEndpoint || ''} onChange={(e) => setS({ ...s, syncEndpoint: e.target.value })} placeholder="https://api.example.com/pos-sync" className="font-mono" /></label>
            <label className="col-span-2">Bearer Token<input type="password" value={s.syncToken || ''} onChange={(e) => setS({ ...s, syncToken: e.target.value })} /></label>
            <label>Sync Enabled<select value={String(!!s.syncEnabled)} onChange={(e) => setS({ ...s, syncEnabled: e.target.value === 'true' })}><option value="true">On (every 10s)</option><option value="false">Off</option></select></label>
            <label>Brand Header<input value={s.brandHeader || 'G H'} onChange={(e) => setS({ ...s, brandHeader: e.target.value })} /></label>
          </>
        )}
        <div className="col-span-2 flex gap-2">
          <button className="btn-ghost" onClick={testDb}>Test MongoDB</button>
          <button className="btn-ghost" onClick={syncNow}>Sync Now</button>
        </div>
      </div>

      <div className="card grid grid-cols-2 gap-3 mb-3">
        <h2 className="col-span-2 font-bold">Printer Configuration</h2>
        <label>POS Thermal (80mm/ESC-POS)
          <select value={s.thermalPrinter || ''} onChange={(e) => setS({ ...s, thermalPrinter: e.target.value })}>
            <option value="">— select —</option>
            {printers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Thermal Interface<input value={s.thermalInterface || ''} onChange={(e) => setS({ ...s, thermalInterface: e.target.value })} placeholder="printer:POS-80 · tcp://192.168.1.50:9100 · COM3" className="font-mono" /></label>
        <label>Barcode Label Printer
          <select value={s.labelPrinter || ''} onChange={(e) => setS({ ...s, labelPrinter: e.target.value })}>
            <option value="">— select —</option>
            {printers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Label Mode<select value={s.labelMode || 'TSPL'} onChange={(e) => setS({ ...s, labelMode: e.target.value })}><option>TSPL</option><option>ZPL</option><option>WINDOWS</option></select></label>
        <div className="col-span-2 text-[11px] text-slate-400">Detected Windows printers: {printers.length ? printers.join(', ') : 'none (connect a printer or use tcp://…:9100)'}</div>
      </div>

      {unlocked ? (
        <div className="card grid grid-cols-2 gap-3 mb-3">
          <h2 className="col-span-2 font-bold">Backup & Restore <span className="text-[11px] font-normal text-slate-400">(daily auto + on-exit snapshot, last 30 kept)</span></h2>
          <label className="col-span-2">Backup folder (USB / OneDrive / Drive supported)<input value={s.backupPath || ''} onChange={(e) => setS({ ...s, backupPath: e.target.value })} placeholder={backupDir || '%APPDATA%/billing_pos/backups/'} className="font-mono" /></label>
          <div className="col-span-2 text-[11px] text-slate-400">Current: <span className="font-mono">{backupDir || '…'}</span> — Save All Settings applies a new folder.</div>
          <div className="col-span-2 flex gap-2 flex-wrap">
            <button className="btn-primary" onClick={manualBackup} disabled={!!backupBusy}>Create Manual Backup Now</button>
            <button className="btn-ghost" onClick={pickExternal} disabled={!!backupBusy}>Restore from external file…</button>
            {backupBusy && <span className="text-xs text-amber-300 animate-pulse self-center">{backupBusy}</span>}
          </div>
          <div className="col-span-2 card p-0 overflow-auto max-h-56">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Size</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.path}>
                    <td className="font-mono">{b.date}</td>
                    <td className="font-mono">{fmtMB(b.size)}</td>
                    <td>{b.status}</td>
                    <td><button className="btn-ghost" disabled={!!backupBusy} onClick={() => { setRestoreTarget(b); setRestoreText(''); setRestoreResult(null); }}>Restore…</button></td>
                  </tr>
                ))}
                {!backups.length && <tr><td colSpan={4} className="text-center text-slate-500 py-4">No snapshots yet — create the first manual backup.</td></tr>}
              </tbody>
            </table>
          </div>
          {restoreTarget && (
            <div className="col-span-2 border border-red-800 rounded p-3 bg-red-950/30">
              <div className="font-bold text-red-300">Restore will OVERWRITE the live database with:</div>
              <div className="font-mono text-sm mt-1">{restoreTarget.name}</div>
              <div className="text-xs text-slate-400 mt-1">Sync pauses during restore and resumes after. Type <b className="font-mono">RESTORE</b> to confirm.</div>
              <div className="flex gap-2 mt-2 items-center flex-wrap">
                <input value={restoreText} onChange={(e) => setRestoreText(e.target.value)} placeholder="Type RESTORE" className="font-mono w-44" />
                <button className="btn-danger" disabled={restoreText !== 'RESTORE' || !!backupBusy} onClick={doRestore}>Confirm Restore</button>
                <button className="btn-ghost" onClick={() => { setRestoreTarget(null); setRestoreText(''); }}>Cancel</button>
              </div>
              {restoreResult && (
                <div className="text-xs text-emerald-300 mt-2">
                  Verified counts — Products {restoreResult.before.products}→{restoreResult.after.products} ·
                  Ledgers {restoreResult.before.ledgers}→{restoreResult.after.ledgers} ·
                  Sales {restoreResult.before.sales}→{restoreResult.after.sales} ·
                  Purchases {restoreResult.before.purchases}→{restoreResult.after.purchases}
                  <button className="btn-ghost ml-3" onClick={() => window.location.reload()}>Reload App</button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="card mb-3 text-xs text-slate-400">Unlock with the Admin password above to manage Backup & Restore.</div>
      )}

      <div className="card grid grid-cols-2 gap-3 mb-3">
        <h2 className="col-span-2 font-bold">Credentials Manager</h2>
        <label>Current password<input type="password" value={pw.oldPass} onChange={(e) => setPw({ ...pw, oldPass: e.target.value })} /></label>
        <label>New password<input type="password" value={pw.newPass} onChange={(e) => setPw({ ...pw, newPass: e.target.value })} /></label>
        <div className="col-span-2"><button className="btn-ghost" onClick={async () => { try { await unwrap(pos().auth.changePassword(pw.oldPass, pw.newPass)); setMsg('Password updated.'); setPw({ oldPass: '', newPass: '' }); } catch (e: any) { setMsg(e.message); } }}>Update Password</button></div>
      </div>

      <button className="btn-primary" onClick={save}>Save All Settings</button>
      {msg && <div className="text-sm text-amber-300 mt-2">{msg}</div>}
    </div>
  );
}
