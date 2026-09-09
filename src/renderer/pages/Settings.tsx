import { useEffect, useState } from 'react';
import { pos, unwrap } from '../lib/api';
import { useSession } from '../hooks/useSession';
import { PAGE_KEYS } from '../../shared/types';

const PAGE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', 'sales-add': 'Sales Add', 'sales-display': 'Sales Display',
  'product-add': 'Product Add', 'product-display': 'Product Display',
  'purchase-add': 'Purchase Add', 'purchase-display': 'Purchase Display',
  'stock-master': 'Stock Master', 'stock-adjustment': 'Stock Adjustment',
  'low-stock': 'Low Stock', 'barcode-print': 'Barcode Print',
  'sales-ledger': 'Sales Ledger', 'purchase-ledger': 'Purchase Ledger',
  'supplier-ledger': 'Supplier Ledger', settings: 'Settings'
};

export default function Settings() {
  const { session } = useSession();
  const isAdmin = session.role === 'ADMIN';
  const [s, setS] = useState<any>({});
  const [printers, setPrinters] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [gate, setGate] = useState('');
  const [pw, setPw] = useState({ oldPass: '', newPass: '' });
  const [backups, setBackups] = useState<any[]>([]);
  const [backupDirs, setBackupDirs] = useState<any[]>([]);
  const [backupBusy, setBackupBusy] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<any | null>(null);
  const [restoreText, setRestoreText] = useState('');
  const [restoreResult, setRestoreResult] = useState<any | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'CASHIER', allowedPages: [...PAGE_KEYS] as string[] });

  useEffect(() => {
    (async () => {
      setS(await unwrap(pos().settings.get()).catch(() => ({})));
      setPrinters(await unwrap<string[]>(pos().printers.list()).catch(() => []));
    })();
  }, []);

  const refreshBackups = async () => {
    try {
      setBackups(await unwrap<any[]>(pos().backup.list()));
      setBackupDirs(await unwrap<any[]>(pos().backup.dirs()).catch(() => []));
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  const refreshUsers = async () => {
    try {
      setUsers(await unwrap<any[]>(pos().users.list()));
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  useEffect(() => {
    if (unlocked) {
      refreshBackups();
      if (isAdmin) refreshUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, isAdmin]);

  const save = async () => {
    try {
      const interval = Math.min(300, Math.max(5, Math.round(Number(s.syncIntervalSec) || 10)));
      const next = { ...s, syncIntervalSec: interval };
      setS(await unwrap(pos().settings.save(next)));
      setMsg('Settings saved (sync interval applied live).');
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

  const fmtMB = (b: number) => `${(Number(b) / 1048576).toFixed(1)} MB`;

  const manualBackup = async () => {
    setBackupBusy('Creating snapshots (A+B)…');
    try {
      const r: any = await unwrap(pos().backup.now());
      setMsg(`Backup created: ${r.name} (${fmtMB(r.size)}) → ${r.dests.map((d: any) => d.tag).join('+')}. Last 30 kept per destination.`);
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

  const togglePage = (pages: string[], k: string) => (pages.includes(k) ? pages.filter((x) => x !== k) : [...pages, k]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-3">Settings & Hardware</h1>
      <div className="card grid grid-cols-2 gap-3 mb-3">
        <h2 className="col-span-2 font-bold">Database & Remote Sync</h2>
        <label className="col-span-2">MongoDB URI<input value={s.mongoUri || ''} onChange={(e) => setS({ ...s, mongoUri: e.target.value })} className="font-mono" /></label>
        {!unlocked ? (
          <div className="col-span-2 flex gap-2 items-end">
            <label className="flex-1">Admin password (to edit sync endpoint)<input type="password" value={gate} onChange={(e) => setGate(e.target.value)} /></label>
            <button
              className="btn-ghost"
              onClick={async () => {
                try {
                  if (session.role && session.role !== 'ADMIN') throw new Error('ADMIN role required');
                  await unwrap(pos().auth.login(session.username || 'ADMIN', gate));
                  setUnlocked(true);
                  setGate('');
                } catch (e: any) {
                  setMsg(e.message);
                }
              }}
            >
              Unlock
            </button>
          </div>
        ) : (
          <>
            <label className="col-span-2">Remote API Sync Endpoint<input value={s.syncEndpoint || ''} onChange={(e) => setS({ ...s, syncEndpoint: e.target.value })} placeholder="https://api.example.com/pos-sync" className="font-mono" /></label>
            <label className="col-span-2">Bearer Token<input type="password" value={s.syncToken || ''} onChange={(e) => setS({ ...s, syncToken: e.target.value })} /></label>
            <label>Sync Enabled<select value={String(!!s.syncEnabled)} onChange={(e) => setS({ ...s, syncEnabled: e.target.value === 'true' })}><option value="true">On</option><option value="false">Off</option></select></label>
            <label>Sync Interval (sec, 5–300)<input type="number" min={5} max={300} value={s.syncIntervalSec ?? 10} onChange={(e) => setS({ ...s, syncIntervalSec: Number(e.target.value) })} /></label>
            <label>Brand Header<input value={s.brandHeader || 'G H'} onChange={(e) => setS({ ...s, brandHeader: e.target.value })} /></label>
            <div className="flex gap-4 items-end pb-2">
              <label className="flex items-center gap-2">Auto-Print Sales Receipt<input type="checkbox" checked={s.autoPrintReceipt !== false} onChange={(e) => setS({ ...s, autoPrintReceipt: e.target.checked })} style={{ width: 'auto' }} /></label>
              <label className="flex items-center gap-2">Auto-Print Barcode on Purchase<input type="checkbox" checked={!!s.autoPrintBarcode} onChange={(e) => setS({ ...s, autoPrintBarcode: e.target.checked })} style={{ width: 'auto' }} /></label>
            </div>
            <label>Item-Not-Found Beep (sec)<input type="number" min={0.1} max={5} step={0.1} value={s.beepDurationSec ?? 1.5} onChange={(e) => setS({ ...s, beepDurationSec: Number(e.target.value) })} /></label>
            <label>Default Min Stock<select value={s.minStockDefault || '1'} onChange={(e) => setS({ ...s, minStockDefault: e.target.value })}><option value="1">1</option><option value="convFactor">Conversion Factor</option></select></label>
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
        <div className="col-span-2 border-t border-slate-800 pt-3">
          <h3 className="font-bold mb-2">Print Format Templates (.rpt)</h3>
          {(['receipt', 'label'] as const).map((kind) => {
            const tpl = kind === 'receipt' ? s.receiptTemplate : s.labelTemplate;
            return (
              <div key={kind} className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-sm w-36 capitalize">{kind} format:</span>
                <span className="text-sm font-mono text-emerald-300">{tpl?.name || 'Built-in layout'}</span>
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    try {
                      const r: any = await unwrap(pos().rpt.import(kind));
                      if (!r.canceled) {
                        setS((p: any) => ({ ...p, [kind === 'receipt' ? 'receiptTemplate' : 'labelTemplate']: r.template }));
                        setMsg(`${kind} template imported: ${r.template.name}`);
                      }
                    } catch (e: any) {
                      setMsg(`Import failed: ${e.message}`);
                    }
                  }}
                >
                  Import .rpt…
                </button>
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    try {
                      const r: any = await unwrap(pos().rpt.sample(kind));
                      if (!r.canceled) setMsg(`Sample written: ${r.file}`);
                    } catch (e: any) {
                      setMsg(e.message);
                    }
                  }}
                >
                  Sample
                </button>
                {tpl && (
                  <button
                    className="btn-ghost"
                    onClick={async () => {
                      await unwrap(pos().rpt.clear(kind));
                      setS((p: any) => ({ ...p, [kind === 'receipt' ? 'receiptTemplate' : 'labelTemplate']: null }));
                      setMsg(`Back to built-in ${kind} layout.`);
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-slate-400">Placeholders: {'{date} {time} {billNo} {customer} {subTotal} {grandTotal}'} + item columns. Invalid files are rejected with a reason.</p>
        </div>
      </div>

      {unlocked ? (
        <div className="card grid grid-cols-2 gap-3 mb-3">
          <h2 className="col-span-2 font-bold">Backup & Restore <span className="text-[11px] font-normal text-slate-400">(dual destination A+B, last 30 kept each)</span></h2>
          <label>Destination A (default %APPDATA%/billing_pos/backups)<input value={s.backupPath || ''} onChange={(e) => setS({ ...s, backupPath: e.target.value })} placeholder={backupDirs.find((d) => d.tag === 'A')?.dir || ''} className="font-mono" /></label>
          <label>Destination B (USB / drive / share)<input value={s.backupPathB || ''} onChange={(e) => setS({ ...s, backupPathB: e.target.value })} placeholder="e.g. D:\GH-Backups" className="font-mono" /></label>
          <div className="col-span-2 flex gap-2 flex-wrap">
            <button className="btn-primary" onClick={manualBackup} disabled={!!backupBusy}>Create Manual Backup Now</button>
            <button className="btn-ghost" onClick={pickExternal} disabled={!!backupBusy}>Restore from external file…</button>
            {backupBusy && <span className="text-xs text-amber-300 animate-pulse self-center">{backupBusy}</span>}
          </div>
          <div className="col-span-2 card p-0 overflow-auto max-h-56">
            <table className="tbl">
              <thead><tr><th>Dest</th><th>Date</th><th>Size</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.dest + b.path}>
                    <td className="font-mono">{b.dest}</td><td className="font-mono">{b.date}</td>
                    <td className="font-mono">{fmtMB(b.size)}</td><td>{b.status}</td>
                    <td><button className="btn-ghost" disabled={!!backupBusy} onClick={() => { setRestoreTarget(b); setRestoreText(''); setRestoreResult(null); }}>Restore…</button></td>
                  </tr>
                ))}
                {!backups.length && <tr><td colSpan={5} className="text-center text-slate-500 py-4">No snapshots yet — create the first manual backup.</td></tr>}
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

      {unlocked && isAdmin && (
        <div className="card grid grid-cols-2 gap-3 mb-3">
          <h2 className="col-span-2 font-bold">User Accounts & RBAC</h2>
          <div className="col-span-2 card p-0 overflow-auto max-h-56">
            <table className="tbl">
              <thead><tr><th>Username</th><th>Role</th><th>Pages</th><th>Active</th><th></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td className="font-mono">{u.username}</td>
                    <td>
                      <select value={u.role} onChange={async (e) => { try { await unwrap(pos().users.update(u._id, { role: e.target.value })); refreshUsers(); } catch (er: any) { setMsg(er.message); } }}>
                        <option>ADMIN</option><option>OPERATOR</option><option>CASHIER</option>
                      </select>
                    </td>
                    <td className="text-[11px]">{u.role === 'ADMIN' ? 'all' : `${(u.allowedPages || []).length} pages`}</td>
                    <td><input type="checkbox" checked={!!u.isActive} onChange={async (e) => { try { await unwrap(pos().users.update(u._id, { isActive: e.target.checked })); refreshUsers(); } catch (er: any) { setMsg(er.message); } }} style={{ width: 'auto' }} /></td>
                    <td className="whitespace-nowrap">
                      <button className="btn-ghost mr-1" onClick={() => { const p = prompt(`Reset password for ${u.username} (min 4 chars):`); if (p) unwrap(pos().users.update(u._id, { password: p })).then(refreshUsers).catch((er: any) => setMsg(er.message)); }}>Reset PW</button>
                      <button className="btn-ghost" onClick={() => { const pages = prompt('Allowed pages (comma-separated keys):', (u.allowedPages || []).join(',')); if (pages !== null) unwrap(pos().users.update(u._id, { allowedPages: pages.split(',').map((x: string) => x.trim()).filter(Boolean) })).then(refreshUsers).catch((er: any) => setMsg(er.message)); }}>Pages…</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label>New username<input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toUpperCase() })} className="font-mono" /></label>
          <label>Password<input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
          <label>Role<select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}><option>ADMIN</option><option>OPERATOR</option><option>CASHIER</option></select></label>
          <div className="flex items-end"><button className="btn-primary" onClick={async () => { try { await unwrap(pos().users.create(newUser)); setNewUser({ username: '', password: '', role: 'CASHIER', allowedPages: [...PAGE_KEYS] }); refreshUsers(); } catch (e: any) { setMsg(e.message); } }}>Create User</button></div>
          <div className="col-span-2 text-[11px] text-slate-400">Default page set for new users:</div>
          <div className="col-span-2 flex gap-2 flex-wrap">
            {PAGE_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-1 text-[11px]">
                <input type="checkbox" checked={newUser.allowedPages.includes(k)} onChange={() => setNewUser({ ...newUser, allowedPages: togglePage(newUser.allowedPages, k) })} style={{ width: 'auto' }} />
                {PAGE_LABELS[k] || k}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="card grid grid-cols-2 gap-3 mb-3">
        <h2 className="col-span-2 font-bold">Credentials Manager</h2>
        <label>Current password<input type="password" value={pw.oldPass} onChange={(e) => setPw({ ...pw, oldPass: e.target.value })} /></label>
        <label>New password<input type="password" value={pw.newPass} onChange={(e) => setPw({ ...pw, newPass: e.target.value })} /></label>
        <div className="col-span-2"><button className="btn-ghost" onClick={async () => { try { await unwrap(pos().auth.changePassword(session.username || '', pw.oldPass, pw.newPass)); setMsg('Password updated.'); setPw({ oldPass: '', newPass: '' }); } catch (e: any) { setMsg(e.message); } }}>Update Password</button></div>
      </div>

      <button className="btn-primary" onClick={save}>Save All Settings</button>
      {msg && <div className="text-sm text-amber-300 mt-2">{msg}</div>}
    </div>
  );
}
