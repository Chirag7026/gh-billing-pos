import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pos, unwrap, inr } from '../lib/api';

export default function SaleDisplay() {
  const nav = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<any | null>(null);
  const [msg, setMsg] = useState('');

  const load = async (s?: string) => {
    try {
      setRows(await unwrap<any[]>(pos().sales.list({ search: s ?? search })));
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

  const open = async (id: string) => {
    setSel(await unwrap(pos().sales.get(id)));
  };
  const reprint = async (id: string) => {
    try {
      const r: any = await unwrap(pos().sales.reprint(id));
      setMsg(r.print.ok ? 'Sent to thermal printer.' : `Print failed: ${r.print.error}`);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Sales Display <span className="kbd ml-2">F2</span></h1>
      <input placeholder="Search bill no or customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72 mb-3" autoFocus />
      {msg && <div className="text-xs text-amber-300 mb-2">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-[60vh]">
        <table className="tbl">
          <thead><tr><th>Bill</th><th>Date</th><th>C/D</th><th>W/R</th><th>Customer</th><th>Items</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td className="font-mono">{r.billNo}</td><td>{r.date}</td><td>{r.paymentType}</td><td>{r.pricingMode}</td>
                <td>{r.customerName}</td><td>{r.totalItems}</td><td className="font-mono">{inr(r.grandTotal)}</td>
                <td className="whitespace-nowrap">
                  <button className="btn-ghost mr-1" onClick={() => open(r._id)}>View</button>
                  <button className="btn-amber mr-1" onClick={() => nav(`/sales/add?edit=${r._id}`)}>Edit</button>
                  <button className="btn-ghost mr-1" onClick={() => reprint(r._id)}>Re-print</button>
                  <button className="btn-danger" onClick={async () => { if (confirm(`Delete bill ${r.billNo}? Stock will be restored.`)) { await unwrap(pos().sales.remove(r._id)); load(); } }}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="card w-full max-w-2xl max-h-[90vh] overflow-auto">
            <h2 className="font-bold">Bill {sel.billNo} · {sel.date} {sel.time} · {sel.customerName}</h2>
            <table className="tbl mt-2">
              <thead><tr><th>#</th><th>Item</th><th>Pack</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead>
              <tbody>{sel.items.map((it: any, i: number) => <tr key={i}><td>{i + 1}</td><td>{it.name}<div className="text-[11px] font-mono text-slate-400">{it.barcode}</div></td><td>{it.pack}</td><td>{it.qty}</td><td>{inr(it.rate)}</td><td>{inr(it.amount)}</td></tr>)}</tbody>
            </table>
            <div className="text-right font-bold mt-2">Grand Total ₹{inr(sel.grandTotal)}</div>
            <div className="text-xs text-slate-400 mt-1">Edit loads the bill into the Sales cart; re-saving recalculates stock differences.</div>
            <div className="flex gap-2 mt-3"><button className="btn-primary" onClick={() => reprint(sel._id)}>Re-print</button><button className="btn-amber" onClick={() => nav(`/sales/add?edit=${sel._id}`)}>Edit in Cart</button><button className="btn-ghost" onClick={() => setSel(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
