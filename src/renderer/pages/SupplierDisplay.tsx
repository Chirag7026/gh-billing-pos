import { useEffect, useMemo, useState } from 'react';
import { pos, unwrap, inr } from '../lib/api';

export default function SupplierDisplay() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      setRows(await unwrap<any[]>(pos().ledgers.list({ search, group: group || undefined })));
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [search, group]);
  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    let dr = 0, cr = 0;
    for (const r of rows) {
      const b = Number(r.currentBalance) || 0;
      if (b >= 0) dr += b;
      else cr += -b;
    }
    return { dr, cr, net: dr - cr };
  }, [rows]);

  const saveEdit = async () => {
    if (!editing) return;
    await unwrap(pos().ledgers.save(editing));
    setEditing(null);
    load();
  };

  const doExcel = async (mode: 'export' | 'import') => {
    try {
      const xls: any = [{ name: 'Excel', extensions: ['xlsx'] }];
      if (mode === 'export') {
        const d: any = await unwrap(pos().excel.dialog('save', xls));
        if (d.canceled) return;
        const r: any = await unwrap(pos().excel.exportLedgers(d.path, group || undefined));
        setMsg(`Exported ${r.count} rows → ${r.filePath}`);
      } else {
        const d: any = await unwrap(pos().excel.dialog('open', xls));
        if (d.canceled) return;
        const r: any = await unwrap(pos().excel.importLedgers(d.path));
        setMsg(`Imported ${r.upserted} accounts`);
        load();
      }
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Supplier / Ledger Display <span className="kbd ml-2">F8</span></h1>
      <div className="flex gap-2 mb-3 flex-wrap">
        <input placeholder="Instant filter by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" autoFocus />
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All groups</option>
          <option>Bank Account</option>
          <option>Sundry Creditors</option>
          <option>Sundry Debtors</option>
        </select>
        <button className="btn-ghost" onClick={() => doExcel('export')}>Excel Export</button>
        <button className="btn-ghost" onClick={() => doExcel('import')}>Excel Import</button>
        <span className="text-xs text-slate-400 ml-auto">Dr {inr(totals.dr)} · Cr {inr(totals.cr)} · Net {inr(totals.net)}</span>
      </div>
      {msg && <div className="text-xs text-amber-300 mb-2">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-[65vh]">
        <table className="tbl">
          <thead><tr><th>Account</th><th>Phone</th><th>City</th><th>Group</th><th>Op.Bal</th><th>C/D</th><th>Current</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td>{r.accountName}</td><td>{r.phone}</td><td>{r.city}</td><td>{r.group}</td>
                <td>{inr(r.openingBalance)}</td><td>{r.balanceType}</td><td>{inr(r.currentBalance)}</td>
                <td className="whitespace-nowrap">
                  <button className="btn-ghost mr-1" onClick={() => setEditing({ ...r })}>Edit</button>
                  <button className="btn-danger" onClick={async () => { if (confirm(`Delete ${r.accountName}?`)) { await unwrap(pos().ledgers.remove(r._id)); load(); } }}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="card w-full max-w-lg grid grid-cols-2 gap-2">
            <h2 className="col-span-2 font-bold">Inline editor — {editing.accountName}</h2>
            <label>Account<input value={editing.accountName} onChange={(e) => setEditing({ ...editing, accountName: e.target.value })} /></label>
            <label>Phone<input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></label>
            <label>City<input value={editing.city || ''} onChange={(e) => setEditing({ ...editing, city: e.target.value })} /></label>
            <label>Group<select value={editing.group} onChange={(e) => setEditing({ ...editing, group: e.target.value })}><option>Bank Account</option><option>Sundry Creditors</option><option>Sundry Debtors</option></select></label>
            <label>Opening<input type="number" value={editing.openingBalance} onChange={(e) => setEditing({ ...editing, openingBalance: Number(e.target.value) })} /></label>
            <label>Cr/Dr<select value={editing.balanceType} onChange={(e) => setEditing({ ...editing, balanceType: e.target.value })}><option>Dr</option><option>Cr</option></select></label>
            <div className="col-span-2 flex gap-2"><button className="btn-primary" onClick={saveEdit}>Save</button><button className="btn-ghost" onClick={() => setEditing(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
