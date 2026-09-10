import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pos, unwrap, inr } from '../lib/api';

export default function PurchaseDisplay() {
  const nav = useNavigate();
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
      <h1 className="ptitle">Purchase Display <span className="kbd ml-2">F6</span></h1>
      <input type="text" placeholder="Search bill no or supplier…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72 mb-3" autoFocus id="q" />
      {msg && <div className="msg-xs">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-65vh">
        <table className="tbl" id="pt">
          <thead><tr><th>Bill No</th><th>Date</th><th>Supplier</th><th>C/D</th><th>Items</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td className="mono">{r.purchaseBillNo}</td><td>{new Date(r.date).toLocaleDateString('en-IN')}</td>
                <td>{r.supplierName}</td><td>{r.paymentType}</td><td>{r.items?.length}</td>
                <td className="mono">{inr(r.totalPurchaseAmount)}</td>
                <td className="whitespace-nowrap"><button className="btn btn-amber mr-1" onClick={() => nav(`/purchase/add?edit=${r._id}`)}>Edit</button><button className="btn btn-danger" onClick={async () => { if (confirm('Delete purchase? (stock not auto-reversed)')) { await unwrap(pos().purchases.remove(r._id)); load(); } }}>Del</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
