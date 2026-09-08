import { useEffect, useState } from 'react';
import { pos, unwrap, inr } from '../lib/api';

export default function PurchaseLedger() {
  const [rows, setRows] = useState<any[]>([]);
  const [supplier, setSupplier] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => {
    (async () => setRows(await unwrap<any[]>(pos().purchases.list({ search: '', limit: 2000 })).catch(() => [])))();
  }, []);

  const filtered = rows.filter((r) => {
    if (supplier && !r.supplierName.toLowerCase().includes(supplier.toLowerCase())) return false;
    const d = new Date(r.date).toISOString().slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
  const total = filtered.reduce((a, r) => a + (Number(r.totalPurchaseAmount) || 0), 0);
  const [msg, setMsg] = useState('');

  const exportXls = async () => {
    try {
      const d: any = await unwrap(pos().excel.dialog('save', [{ name: 'Legacy Excel 97-2004', extensions: ['xls'] }]));
      if (d.canceled) return;
      const r: any = await unwrap(pos().excel.exportPurchase(d.path, supplier || undefined, from || undefined, to || undefined));
      setMsg(`Exported ${r.count} rows (.xls) → ${r.filePath}`);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Purchase Ledger</h1>
      <div className="flex gap-2 mb-3 items-end flex-wrap">
        <label>Supplier<input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Filter supplier…" /></label>
        <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <span className="text-sm ml-auto">Aggregate <b>₹{inr(total)}</b> · {filtered.length} bills</span>
        <button className="btn-ghost" onClick={exportXls}>.xls Export</button>
      </div>
      {msg && <div className="text-xs text-amber-300 mb-2">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-[60vh]">
        <table className="tbl">
          <thead><tr><th>Bill No</th><th>Date</th><th>Supplier</th><th>Amount</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r._id}><td className="font-mono">{r.purchaseBillNo}</td><td>{new Date(r.date).toLocaleDateString('en-IN')}</td><td>{r.supplierName}</td><td className="font-mono">{inr(r.totalPurchaseAmount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
