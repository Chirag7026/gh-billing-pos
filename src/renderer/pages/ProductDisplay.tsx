import { useEffect, useState } from 'react';
import { pos, unwrap, inr } from '../lib/api';

export default function ProductDisplay() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [msg, setMsg] = useState('');
  const [rates, setRates] = useState<number[]>([0, 5, 12, 18, 28]);

  const load = async (s?: string) => {
    try {
      setRows(await unwrap<any[]>(pos().products.list({ search: s ?? search, limit: 500 })));
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  useEffect(() => {
    pos().masters.list('gstRate').then((r: any) => { if (r.ok && r.data?.length) setRates(r.data.map((x: any) => Number(x.value))); }).catch(() => {});
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(), 150);
    return () => clearTimeout(t);
  }, [search]);

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
      <h1 className="ptitle">Product Display <span className="kbd ml-2">F4</span></h1>
      <div className="flex gap-2 mb-3 flex-wrap">
        <input type="text" placeholder="Wildcard search: name, alias, barcode (* ? %)…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72 mono" autoFocus id="q" />
        <button className="btn btn-ghost" onClick={() => doExcel('export')}>Export .xls</button>
        <button className="btn btn-ghost" onClick={() => doExcel('import')}>Import .xls</button>
        <span className="text-xs text-slate-400 ml-auto" id="count">{rows.length} rows</span>
      </div>
      {msg && <div className="msg-xs">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-65vh">
        <table className="tbl" id="pt">
          <thead><tr><th>Barcode</th><th>Name</th><th>Alias</th><th>Unit</th><th>MRP</th><th>Pur</th><th>WH</th><th>Rt</th><th>Conv</th><th>Clo.Qty</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td className="mono">{r.barcode}</td><td>{r.name}</td><td className="mono">{r.alias}</td><td>{r.unit}</td>
                <td>₹{inr(r.mrp)}</td><td>₹{inr(r.purRate)}</td><td>₹{inr(r.whRate)}</td><td>₹{inr(r.rtRate)}</td>
                <td>{r.convFactor}</td><td>{r.cloQty}</td>
                <td className="whitespace-nowrap">
                  <button className="btn btn-ghost mr-1" onClick={() => setEditing({ ...r })}>Edit</button>
                  <button className="btn btn-danger" onClick={async () => { if (confirm(`Delete ${r.name}?`)) { await unwrap(pos().products.remove(r._id)); load(); } }}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="modal-overlay">
          <div className="card w-full max-w-2xl grid grid-cols-3 gap-2 max-h-90vh overflow-auto">
            <h2 className="font-bold col-span-3" id="edit-title">Edit — {editing.barcode}</h2>
            {(['name', 'alias', 'barcode', 'group', 'hsnCode', 'gstType', 'unit'] as const).map((k) => (
              <label key={k} className="lbl">{k}<input type="text" value={editing[k] || ''} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} /></label>
            ))}
            <label className="lbl">gstRate<select value={editing.gstRate ?? 0} onChange={(e) => setEditing({ ...editing, gstRate: Number(e.target.value) })}>{[...new Set([...rates, Number(editing.gstRate) || 0])].map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
            {(['minStock', 'convFactor', 'openingStock', 'mrp', 'purRate', 'whRate', 'rtRate', 'boxStock', 'cloQty'] as const).map((k) => (
              <label key={k} className="lbl">{k}<input type="number" value={editing[k] ?? 0} onChange={(e) => setEditing({ ...editing, [k]: Number(e.target.value) })} /></label>
            ))}
            <div className="col-span-3 flex gap-2">
              <button className="btn btn-primary" onClick={async () => { await unwrap(pos().products.save(editing)); setEditing(null); load(); }}>Save</button>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
