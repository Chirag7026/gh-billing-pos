import { useEffect, useState } from 'react';
import { pos, unwrap } from '../lib/api';
import { useSession } from '../hooks/useSession';
import { LEGACY_PAGE_KEYS, PAGE_KEYS } from '../../shared/types';
import { expandPages } from '../hooks/useSession';

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
  const [backups, setBackups] = useState<any[]>([]);
  const [backupDirs, setBackupDirs] = useState<any[]>([]);
  const [backupBusy, setBackupBusy] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<any | null>(null);
  const [restoreText, setRestoreText] = useState('');
  const [restoreResult, setRestoreResult] = useState<any | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [mGroup, setMGroup] = useState('');
  const [mUnit, setMUnit] = useState('');
  const [mUnitCode, setMUnitCode] = useState('');
  const [mRate, setMRate] = useState('');
  const blankUserForm = { username: '', password: '', role: 'CASHIER', active: true, pages: [...PAGE_KEYS] as string[], canEdit: true, canDelete: true };
  const [userForm, setUserForm] = useState({ ...blankUserForm });
  const resetUserForm = () => {
    setEditingUserId(null);
    setUserForm({ username: '', password: '', role: 'CASHIER', active: true, pages: [...PAGE_KEYS], canEdit: true, canDelete: true });
  };

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
  const refreshMasters = async () => {
    try {
      const [g, u, r] = await Promise.all([
        unwrap<any[]>(pos().masters.list('group')),
        unwrap<any[]>(pos().masters.list('unit')),
        unwrap<any[]>(pos().masters.list('gstRate'))
      ]);
      setGroups(g);
      setUnits(u);
      setRates(r);
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  useEffect(() => {
    if (unlocked) {
      refreshBackups();
      if (isAdmin) {
        refreshUsers();
        refreshMasters();
      }
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
      <h1 className="ptitle">Settings & Hardware</h1>
      <div className="card grid grid-cols-2 gap-3 mb-3">
        <h2 className="cardtitle col-span-2">Database & Remote Sync</h2>
        <label className="lbl col-span-2">MongoDB URI<input value={s.mongoUri || ''} onChange={(e) => setS({ ...s, mongoUri: e.target.value })} className="mono" /></label>
        {!unlocked ? (
          <div className="col-span-2 flex gap-2 items-end" id="lock-row">
            <label className="lbl flex-1">Admin password (to edit sync endpoint)<input type="password" value={gate} onChange={(e) => setGate(e.target.value)} /></label>
            <button
              className="btn btn-ghost"
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
            <label className="lbl col-span-2">Remote API Sync Endpoint<input value={s.syncEndpoint || ''} onChange={(e) => setS({ ...s, syncEndpoint: e.target.value })} placeholder="https://api.example.com/pos-sync" className="mono" /></label>
            <label className="lbl col-span-2">Bearer Token<input type="password" value={s.syncToken || ''} onChange={(e) => setS({ ...s, syncToken: e.target.value })} /></label>
            <label className="lbl">Sync Enabled<select value={String(!!s.syncEnabled)} onChange={(e) => setS({ ...s, syncEnabled: e.target.value === 'true' })}><option value="true">On</option><option value="false">Off</option></select></label>
            <label className="lbl">Sync Interval (sec, 5–300)<input type="number" min={5} max={300} value={s.syncIntervalSec ?? 10} onChange={(e) => setS({ ...s, syncIntervalSec: Number(e.target.value) })} /></label>
            <label className="lbl">Brand Header<input value={s.brandHeader || 'G H'} onChange={(e) => setS({ ...s, brandHeader: e.target.value })} /></label>
            <div className="flex gap-4 items-end pb-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.autoPrintReceipt !== false} onChange={(e) => setS({ ...s, autoPrintReceipt: e.target.checked })} style={{ width: 'auto' }} />Auto-Print Sales Receipt</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.autoPrintBarcode} onChange={(e) => setS({ ...s, autoPrintBarcode: e.target.checked })} style={{ width: 'auto' }} />Auto-Print Barcode on Purchase</label>
            </div>
            <label className="lbl">Item-Not-Found Beep (sec)<input type="number" min={0.1} max={5} step={0.1} value={s.beepDurationSec ?? 1.5} onChange={(e) => setS({ ...s, beepDurationSec: Number(e.target.value) })} /></label>
            <label className="lbl">Default Min Stock<select value={s.minStockDefault || '1'} onChange={(e) => setS({ ...s, minStockDefault: e.target.value })}><option value="1">1</option><option value="convFactor">Conversion Factor</option></select></label>
          </>
        )}
        <div className="col-span-2 flex gap-2">
          <button className="btn btn-ghost" onClick={testDb}>Test MongoDB</button>
          <button className="btn btn-ghost" onClick={syncNow}>Sync Now</button>
        </div>
      </div>

      <div className="card grid grid-cols-2 gap-3 mb-3">
        <h2 className="cardtitle col-span-2">Printer Configuration</h2>
        <label className="lbl">POS Thermal (80mm/ESC-POS)
          <select value={s.thermalPrinter || ''} onChange={(e) => setS({ ...s, thermalPrinter: e.target.value })}>
            <option value="">— select —</option>
            {printers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="lbl">Thermal Interface<input value={s.thermalInterface || ''} onChange={(e) => setS({ ...s, thermalInterface: e.target.value })} placeholder="printer:POS-80 · tcp://192.168.1.50:9100 · COM3" className="mono" /></label>
        <label className="lbl">Barcode Label Printer
          <select value={s.labelPrinter || ''} onChange={(e) => setS({ ...s, labelPrinter: e.target.value })}>
            <option value="">— select —</option>
            {printers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="lbl">Label Mode<select value={s.labelMode || 'TSPL'} onChange={(e) => setS({ ...s, labelMode: e.target.value })}><option>TSPL</option><option>ZPL</option><option>WINDOWS</option></select></label>
        <div className="col-span-2 text-slate-400" style={{ fontSize: 11 }}>Detected Windows printers: {printers.length ? printers.join(', ') : 'none (connect a printer or use tcp://…:9100)'}</div>
        <div className="col-span-2 border-t border-slate-800 pt-3">
          <h3 className="font-bold mb-2">Print Format Templates (.rpt)</h3>
          {(['receipt', 'label'] as const).map((kind) => {
            const tpl = kind === 'receipt' ? s.receiptTemplate : s.labelTemplate;
            return (
              <div key={kind} className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-sm w-36 capitalize">{kind} format:</span>
                <span className="text-sm font-mono text-emerald-300">{tpl?.name || 'Built-in layout'}</span>
                <button
                  className="btn btn-ghost"
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
                  className="btn btn-ghost"
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
                    className="btn btn-ghost"
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
          <p className="text-slate-400" style={{ fontSize: 11 }}>Placeholders: {'{date} {time} {billNo} {customer} {subTotal} {grandTotal}'} + item columns. Invalid files are rejected with a reason.</p>
        </div>
      </div>

      {unlocked ? (
        <div className="card grid grid-cols-2 gap-3 mb-3" id="backup-card">
          <h2 className="cardtitle col-span-2">Backup & Restore <span className="text-slate-400 font-normal" style={{ fontSize: 11 }}>(dual destination A+B, last 30 kept each)</span></h2>
          <label className="lbl">Destination A (default %APPDATA%/billing_pos/backups)<input value={s.backupPath || ''} onChange={(e) => setS({ ...s, backupPath: e.target.value })} placeholder={backupDirs.find((d) => d.tag === 'A')?.dir || ''} className="mono" /></label>
          <label className="lbl">Destination B (USB / drive / share)<input value={s.backupPathB || ''} onChange={(e) => setS({ ...s, backupPathB: e.target.value })} placeholder="e.g. D:\GH-Backups" className="mono" /></label>
          <div className="col-span-2 flex gap-2 flex-wrap">
            <button className="btn btn-primary" onClick={manualBackup} disabled={!!backupBusy}>Create Manual Backup Now</button>
            <button className="btn btn-ghost" onClick={pickExternal} disabled={!!backupBusy}>Restore from external file…</button>
            {backupBusy && <span className="text-xs text-amber-300 animate-pulse self-center">{backupBusy}</span>}
          </div>
          <div className="col-span-2 card p-0 overflow-auto max-h-56">
            <table className="tbl">
              <thead><tr><th>Dest</th><th>Date</th><th>Size</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.dest + b.path}>
                    <td className="mono">{b.dest}</td><td className="mono">{b.date}</td>
                    <td className="mono">{fmtMB(b.size)}</td><td>{b.status}</td>
                    <td><button className="btn btn-ghost" disabled={!!backupBusy} onClick={() => { setRestoreTarget(b); setRestoreText(''); setRestoreResult(null); }}>Restore…</button></td>
                  </tr>
                ))}
                {!backups.length && <tr><td colSpan={5} className="text-center text-slate-500 py-4">No snapshots yet — create the first manual backup.</td></tr>}
              </tbody>
            </table>
          </div>
          {restoreTarget && (
            <div className="col-span-2 redpanel" id="restore-panel">
              <div className="font-bold text-red-300">Restore will OVERWRITE the live database with:</div>
              <div className="mono text-sm mt-1" id="restore-name">{restoreTarget.name}</div>
              <div className="text-xs text-slate-400 mt-1">Sync pauses during restore and resumes after. Type <b className="mono">RESTORE</b> to confirm.</div>
              <div className="flex gap-2 mt-2 items-center flex-wrap">
                <input value={restoreText} onChange={(e) => setRestoreText(e.target.value)} placeholder="Type RESTORE" className="mono w-44" id="restore-text" />
                <button className="btn btn-danger" id="restore-confirm" disabled={restoreText !== 'RESTORE' || !!backupBusy} onClick={doRestore}>Confirm Restore</button>
                <button className="btn btn-ghost" onClick={() => { setRestoreTarget(null); setRestoreText(''); }}>Cancel</button>
              </div>
            </div>
          )}
          {restoreResult && (
            <div className="col-span-2 text-sm text-emerald-300" id="restore-done">
              Verified counts — Products {restoreResult.before.products}→{restoreResult.after.products} ·
              Ledgers {restoreResult.before.ledgers}→{restoreResult.after.ledgers} ·
              Sales {restoreResult.before.sales}→{restoreResult.after.sales} ·
              Purchases {restoreResult.before.purchases}→{restoreResult.after.purchases}
              <button className="btn btn-ghost ml-3" onClick={() => window.location.reload()}>Reload App</button>
            </div>
          )}
        </div>
      ) : (
        <div className="card mb-3 text-xs text-slate-400" id="backup-locked">Unlock with the Admin password above to manage Backup & Restore.</div>
      )}

      {unlocked && (isAdmin || s.rbacEnabled !== true) && (
        <div className="card mb-3" id="users-card">
          <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 12 }}>
            <h2 className="cardtitle" style={{ color: '#cdf138', fontSize: 17 }}>User Management (RBAC)</h2>
            {isAdmin && (
              <label className="flex items-center gap-2 text-sm ml-auto" title="OFF = every user sees everything. ON = enforce per-user pages and receipt actions.">
                <input
                  type="checkbox"
                  checked={s.rbacEnabled === true}
                  onChange={(e) => setS({ ...s, rbacEnabled: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                Enforcement {s.rbacEnabled === true ? 'ON' : 'OFF'}
              </label>
            )}
          </div>
          {s.rbacEnabled !== true && (
            <p className="text-[11px] text-slate-400 mb-2">Enforcement is OFF — every logged-in user can open all pages and manage users. An ADMIN can turn enforcement ON here.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="lbl">Username<input value={userForm.username} disabled={!!editingUserId} onChange={(e) => setUserForm({ ...userForm, username: e.target.value.toUpperCase() })} className="mono" /></label>
            <label className="lbl">Password<input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder={editingUserId ? '(blank keeps current)' : ''} /></label>
            <label className="lbl">Role
              <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                <option>ADMIN</option><option>OPERATOR</option><option>CASHIER</option>
              </select>
            </label>
            <label className="lbl">Active
              <input type="checkbox" checked={userForm.active} onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })} style={{ width: 'auto', height: 18, accentColor: '#7c3aed' }} />
            </label>
          </div>
          <div className="text-sm text-slate-400 mt-3 mb-1">Authorized Pages</div>          <div className="flex gap-2 flex-wrap mb-3" style={{ gap: '4px 16px' }}>
            {PAGE_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={userForm.pages.includes(k)}
                  onChange={() => setUserForm({ ...userForm, pages: togglePage(userForm.pages, k) })}
                  style={{ width: 'auto' }}
                />
                {PAGE_LABELS[k] || k}
              </label>
            ))}
          </div>
          <div className="text-sm text-slate-400 mt-3 mb-1">Receipt Actions</div>
          <div className="flex gap-4 flex-wrap mb-3">
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={userForm.canEdit} onChange={(e) => setUserForm({ ...userForm, canEdit: e.target.checked })} style={{ width: 'auto' }} />
              Can edit receipts
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={userForm.canDelete} onChange={(e) => setUserForm({ ...userForm, canDelete: e.target.checked })} style={{ width: 'auto' }} />
              Can delete / void receipts
            </label>
          </div>
          <div className="flex gap-2 mb-4">
            <button
              className="btn font-semibold"
              style={{ background: '#cdf138', color: '#161824' }}
              onClick={async () => {
                try {
                  if (editingUserId) {
                    const patch: any = { role: userForm.role, allowedPages: userForm.pages, isActive: userForm.active, canEditReceipt: userForm.canEdit, canDeleteReceipt: userForm.canDelete };
                    if (userForm.password) patch.password = userForm.password;
                    await unwrap(pos().users.update(editingUserId, patch));
                    setMsg(`User ${userForm.username} updated.`);
                  } else {
                    await unwrap(pos().users.create({ username: userForm.username, password: userForm.password, role: userForm.role, allowedPages: userForm.pages, canEditReceipt: userForm.canEdit, canDeleteReceipt: userForm.canDelete }));
                    setMsg(`User ${userForm.username} created.`);
                  }
                  resetUserForm();
                  refreshUsers();
                } catch (e: any) {
                  setMsg(e.message);
                }
              }}
            >
              Save User
            </button>
            <button className="btn btn-ghost" onClick={resetUserForm}>New User</button>
            {editingUserId && <button className="btn btn-ghost" onClick={resetUserForm}>Cancel Edit</button>}
          </div>
          <table className="tbl">
            <thead><tr><th>User</th><th>Role</th><th>Pages</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td className="font-bold">{u.username}</td>
                  <td>{u.role}</td>
                  <td className="text-xs text-slate-300">{u.role === 'ADMIN' ? 'all pages' : (u.allowedPages || []).map((k: string) => PAGE_LABELS[k] || k).join(', ')}</td>
                  <td>{u.isActive ? 'Yes' : 'No'}</td>
                  <td>
                    <button
                      className="btn font-semibold text-sm"
                      style={{ background: '#cdf138', color: '#161824', padding: '6px 16px' }}
                      onClick={() => {
                        setEditingUserId(u._id);
                        setUserForm({ username: u.username, password: '', role: u.role, active: !!u.isActive, pages: u.role === 'ADMIN' ? [...PAGE_KEYS] : expandPages(u.allowedPages || []), canEdit: u.canEditReceipt !== false, canDelete: u.canDeleteReceipt !== false });
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unlocked && isAdmin && (
        <div className="card grid grid-cols-2 gap-3 mb-3">
          <h2 className="cardtitle col-span-2">Masters — Groups, Units, GST%</h2>
          <div>
            <h3 className="font-bold text-sm mb-1">Product Groups</h3>
            <div className="flex gap-2 mb-2">
              <input value={mGroup} onChange={(e) => setMGroup(e.target.value.toUpperCase())} placeholder="GROUP NAME" className="mono" />
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  try {
                    if (!mGroup.trim()) throw new Error('Group name required');
                    await unwrap(pos().masters.add({ kind: 'group', name: mGroup }));
                    setMGroup('');
                    refreshMasters();
                  } catch (e: any) {
                    setMsg(e.message);
                  }
                }}
              >
                Add
              </button>
            </div>
            <div className="card p-0 overflow-auto max-h-44">
              <table className="tbl">
                <tbody>
                  {groups.map((g) => (
                    <tr key={g._id}>
                      <td>{g.name}</td>
                      <td className="text-right"><button className="btn btn-danger" onClick={async () => { if (confirm(`Delete group ${g.name}?`)) { await unwrap(pos().masters.remove(g._id)); refreshMasters(); } }}>Del</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="font-bold text-sm mb-1">Units</h3>
            <div className="flex gap-2 mb-2">
              <input value={mUnit} onChange={(e) => setMUnit(e.target.value.toUpperCase())} placeholder="UNIT" className="mono" />
              <input value={mUnitCode} onChange={(e) => setMUnitCode(e.target.value.toUpperCase())} placeholder="CODE" className="mono w-20" />
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  try {
                    if (!mUnit.trim()) throw new Error('Unit name required');
                    await unwrap(pos().masters.add({ kind: 'unit', name: mUnit, code: mUnitCode }));
                    setMUnit('');
                    setMUnitCode('');
                    refreshMasters();
                  } catch (e: any) {
                    setMsg(e.message);
                  }
                }}
              >
                Add
              </button>
            </div>
            <div className="card p-0 overflow-auto max-h-44">
              <table className="tbl">
                <tbody>
                  {units.map((u) => (
                    <tr key={u._id}>
                      <td>{u.name}</td><td className="mono text-slate-400">{u.code}</td>
                      <td className="text-right"><button className="btn btn-danger" onClick={async () => { if (confirm(`Delete unit ${u.name}?`)) { await unwrap(pos().masters.remove(u._id)); refreshMasters(); } }}>Del</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="col-span-2">
            <h3 className="font-bold text-sm mb-1">Custom GST% Slabs</h3>
            <div className="flex gap-2 mb-2 items-end">
              <label className="lbl">Rate %<input type="number" min={0} max={100} value={mRate} onChange={(e) => setMRate(e.target.value)} className="w-28" /></label>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  try {
                    await unwrap(pos().masters.add({ kind: 'gstRate', name: String(Number(mRate)), value: Number(mRate) }));
                    setMRate('');
                    refreshMasters();
                  } catch (e: any) {
                    setMsg(e.message);
                  }
                }}
              >
                Add Slab
              </button>
              <span className="text-[11px] text-slate-400">Product GST% dropdowns pull from here (e.g. 0, 3, 5, 12, 18, 28, 40).</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {rates.map((r) => (
                <span key={r._id} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 border border-slate-700 mono">
                  {r.value}%
                  <button className="text-red-400 ml-1" title="Delete slab" onClick={async () => { if (confirm(`Delete ${r.value}% slab?`)) { await unwrap(pos().masters.remove(r._id)); refreshMasters(); } }}>✕</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <button className="btn btn-primary" onClick={save}>Save All Settings</button>
      {msg && <div className="msg" id="pagemsg">{msg}</div>}
    </div>
  );
}
