import { useEffect, useMemo, useState } from 'react';
import { pos, unwrap, inr } from '../lib/api';
import { wildcardMatch } from '../lib/wildcard';

export default function StockMaster() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const r: any = await unwrap(pos().stock.master());
      setRows(r.rows);
      setTotal(r.total);
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => rows.filter((r) => wildcardMatch(r.name, search) || wildcardMatch(r.barcode, search) || wildcardMatch(r.alias, search)),
    [rows, search]
  );
  const fTotal = useMemo(() => filtered.reduce((a, r) => a + (Number(r.totalAmount) || 0), 0), [filtered]);

  return (
    <div>
      <h1 className="ptitle">Stock Master</h1>
      <div className="flex gap-2 mb-3 flex-wrap">
        <input type="text" placeholder="Wildcard search: name, alias, barcode (* ? %)…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-80 mono" autoFocus id="q" />
        <span className="text-xs text-slate-400 ml-auto" id="count">{filtered.length} items</span>
      </div>
      {msg && <div className="msg-xs">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-60vh">
        <table className="tbl" id="sm">
          <thead><tr><th>Barcode</th><th>Name</th><th>Alias</th><th>Unit</th><th>Pur Rate</th><th>Available Qty</th><th>Total Amount</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r._id}>
                <td className="mono">{r.barcode}</td><td>{r.name}</td><td className="mono">{r.alias}</td>
                <td>{r.unit}</td><td className="mono">₹{inr(r.purRate)}</td>
                <td className="mono">{r.cloQty}</td><td className="mono">₹{inr(r.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card mt-3 flex items-center">
        <span className="font-bold">Inventory Total Σ(Total Amount)</span>
        <b className="mono text-emerald-300 text-xl ml-auto">₹{inr(search ? fTotal : total)}</b>
      </div>
    </div>
  );
}
