import { useEffect, useState } from 'react';
import { pos, unwrap, inr } from '../lib/api';

export default function ProductDisplay() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [msg, setMsg] = useState('');

  const load = async (s?: string) => {
    try {
      setRows(await unwrap<any[]>(pos().products.list({ search: s ?? search, limit: 500 })));
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  useEffect(() => {
    const t = setTimeout(() => load(), 150);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    load('');
  }, []);

  const doExcel = async (mode: 'export' | 'import') => {
    try {
      const xls: any = [{ name: 'Legacy Excel 97-2004', extensions: ['xls'] }];
      if (mode === 'export') {
        const d: any = await unwrap(pos().excel.dialog('save', xls));
        if (d.canceled) return;
        const r: any = await unwrap(pos().excel.exportProducts(d.path));
        setMsg(`Exported ${r.count} products (.xls) → ${r.filePath}`);
      } else {
        const d: any = await unwrap(pos().excel.dialog('open', xls));
        if (d.canceled) return;
        const r: any = await unwrap(pos().excel.importProducts(d.path));
        setMsg(`Imported/upserted ${r.upserted}${r.errors?.length ? ` · ${r.errors.length} errors` : ''}`);
        load();
      }
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Product Display <span className="kbd ml-2">F4</span></h1>
      <div className="flex gap-2 mb-3 flex-wrap">
        <input placeholder="WILDCARD SEARCH: NAME, ALIAS, BARCODE (* ? %)…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72 font-mono" autoFocus />
        <button className="btn-ghost" onClick={() => doExcel('export')}>Export .xls</button>
        <button className="btn-ghost" onClick={() => doExcel('import')}>Import .xls</button>
        <span className="text-xs text-slate-400 ml-auto">{rows.length} rows</span>
      </div>
      {msg && <div className="text-xs text-amber-300 mb-2">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-[65vh]">
        <table className="tbl">
          <thead><tr><th>Barcode</th><th>Name</th><th>Alias</th><th>Unit</th><th>MRP</th><th>Pur</th><th>WH</th><th>Rt</th><th>Conv</th><th>Clo.Qty</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td className="font-mono">{r.barcode}</td><td>{r.name}</td><td className="font-mono">{r.alias}</td><td>{r.unit}</td>
                <td className="font-mono">₹{inr(r.mrp)}</td><td className="font-mono">₹{inr(r.purRate)}</td><td className="font-mono">₹{inr(r.whRate)}</td><td className="font-mono">₹{inr(r.rtRate)}</td>
                <td>{r.convFactor}</td><td>{r.cloQty}</td>
                <td className="whitespace-nowrap">
                  <button className="btn-ghost mr-1" onClick={() => setEditing({ ...r })}>Edit</button>
                  <button className="btn-danger" onClick={async () => { if (confirm(`Delete ${r.name}?`)) { await unwrap(pos().products.remove(r._id)); load(); } }}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="card w-full max-w-2xl grid grid-cols-3 gap-2 max-h-[90vh] overflow-auto">
            <h2 className="col-span-3 font-bold">Edit — {editing.barcode}</h2>
            {(['name', 'alias', 'barcode', 'group', 'hsnCode', 'gstType', 'unit'] as const).map((k) => (
              <label key={k}>{k}<input value={editing[k] || ''} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} /></label>
            ))}
            {(['gstRate', 'minStock', 'convFactor', 'openingStock', 'mrp', 'purRate', 'whRate', 'rtRate', 'boxStock', 'cloQty'] as const).map((k) => (
              <label key={k}>{k}<input type="number" value={editing[k] ?? 0} onChange={(e) => setEditing({ ...editing, [k]: Number(e.target.value) })} /></label>
            ))}
            <div className="col-span-3 flex gap-2">
              <button className="btn-primary" onClick={async () => { await unwrap(pos().products.save(editing)); setEditing(null); load(); }}>Save</button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
