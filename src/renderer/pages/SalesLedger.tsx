import { useEffect, useState } from 'react';
import { pos, unwrap, inr } from '../lib/api';

export default function SalesLedger() {
  const [rows, setRows] = useState<any[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const all = await unwrap<any[]>(pos().sales.list({ limit: 2000 }));
      setRows(all);
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const norm = (s: string) => {
    const m = /^(\d\d)\/(\d\d)\/(\d\d\d\d)$/.exec(s || '');
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  };
  const filtered = rows.filter((r) => {
    const n = norm(r.date);
    if (from && n < from) return false;
    if (to && n > to) return false;
    return true;
  });
  const gross = filtered.reduce((a, r) => a + (Number(r.grandTotal) || 0), 0);
  const cash = filtered.filter((r) => r.paymentType === 'Cash').reduce((a, r) => a + (Number(r.grandTotal) || 0), 0);
  const debit = gross - cash;

  const exportXlsx = async () => {
    try {
      const d: any = await unwrap(pos().excel.dialog('save', [{ name: 'Excel', extensions: ['xlsx'] }]));
      if (d.canceled) return;
      const f = (iso: string) => (iso ? iso.split('-').reverse().join('/') : undefined);
      const r: any = await unwrap(pos().excel.exportSales(d.path, f(from), f(to)));
      setMsg(`Exported ${r.count} rows → ${r.filePath}`);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Sales Ledger</h1>
      <div className="flex gap-2 mb-3 items-end flex-wrap">
        <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn-ghost" onClick={exportXlsx}>Excel Export</button>
        <span className="text-sm ml-auto">Gross <b>₹{inr(gross)}</b> · Cash <b>₹{inr(cash)}</b> · Debit <b>₹{inr(debit)}</b> · Net <b>₹{inr(gross)}</b></span>
      </div>
      {msg && <div className="text-xs text-amber-300 mb-2">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-[60vh]">
        <table className="tbl">
          <thead><tr><th>Sr.</th><th>Date</th><th>C/D</th><th>Bill No.</th><th>Customer</th><th>Amount</th></tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r._id}><td>{i + 1}</td><td>{r.date}</td><td>{r.paymentType === 'Cash' ? 'C' : 'D'}</td><td className="font-mono">{r.billNo}</td><td>{r.customerName}</td><td className="font-mono">{inr(r.grandTotal)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
