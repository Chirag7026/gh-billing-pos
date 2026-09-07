import { useEffect, useState } from 'react';
import { pos, unwrap, inr } from '../lib/api';

export default function PurchaseDisplay() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const load = async (s?: string) => {
    try {
      setRows(await unwrap<any[]>(pos().purchases.list({ search: s ?? search })));
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
  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Purchase Display <span className="kbd ml-2">F4</span></h1>
      <input placeholder="Search bill no or supplier…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72 mb-3" autoFocus />
      {msg && <div className="text-xs text-amber-300 mb-2">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-[65vh]">
        <table className="tbl">
          <thead><tr><th>Bill No</th><th>Date</th><th>Supplier</th><th>C/D</th><th>Items</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td className="font-mono">{r.purchaseBillNo}</td><td>{new Date(r.date).toLocaleDateString('en-IN')}</td>
                <td>{r.supplierName}</td><td>{r.paymentType}</td><td>{r.items?.length}</td>
                <td className="font-mono">{inr(r.totalPurchaseAmount)}</td>
                <td><button className="btn-danger" onClick={async () => { if (confirm('Delete purchase? (stock not auto-reversed)')) { await unwrap(pos().purchases.remove(r._id)); load(); } }}>Del</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
