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
      <h1 className="text-2xl font-bold mb-3">Stock Master</h1>
      <div className="flex gap-2 mb-3 flex-wrap">
        <input placeholder="Wildcard search: name, alias, barcode (* ? %)…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-80 font-mono" autoFocus />
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} items</span>
      </div>
      {msg && <div className="text-xs text-amber-300 mb-2">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-[60vh]">
        <table className="tbl">
          <thead><tr><th>Barcode</th><th>Name</th><th>Alias</th><th>Unit</th><th>Pur Rate</th><th>Available Qty</th><th>Total Amount</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r._id}>
                <td className="font-mono">{r.barcode}</td><td>{r.name}</td><td className="font-mono">{r.alias}</td>
                <td>{r.unit}</td><td className="font-mono">₹{inr(r.purRate)}</td>
                <td className="font-mono">{r.cloQty}</td><td className="font-mono">₹{inr(r.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card mt-3 flex items-center">
        <span className="font-bold">Inventory Total Σ(Total Amount)</span>
        <b className="font-mono text-emerald-300 text-xl ml-auto">₹{inr(search ? fTotal : total)}</b>
      </div>
    </div>
  );
}
