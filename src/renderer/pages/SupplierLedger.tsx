import { useEffect, useState } from 'react';
import { pos, unwrap, inr } from '../lib/api';
export default function SupplierLedger() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [sel, setSel] = useState('');
  const [purchases, setPurchases] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [s, p] = await Promise.all([
        unwrap<any[]>(pos().ledgers.list({})).catch(() => []),
        unwrap<any[]>(pos().purchases.list({ limit: 2000 })).catch(() => [])
      ]);
      setSuppliers(s);
      setLedgers(s);
      setPurchases(p);
      if (s.length) setSel(s[0]._id);
    })();
  }, []);

  const account = ledgers.find((l) => l._id === sel);
  const invoices = purchases.filter((p) => p.supplierId === sel || (account && p.supplierName === account.accountName));
  const debit = invoices.reduce((a, r) => a + (Number(r.totalPurchaseAmount) || 0), 0);
  const opening = Number(account?.openingBalance) || 0;
  const closing = (Number(account?.currentBalance) || 0) || opening;
  const [msg, setMsg] = useState('');

  const exportXls = async () => {
    try {
      const d: any = await unwrap(pos().excel.dialog('save', [{ name: 'Legacy Excel 97-2004', extensions: ['xls'] }]));
      if (d.canceled) return;
      const r: any = await unwrap(pos().excel.exportPurchase(d.path, account?.accountName || undefined));
      setMsg(`Exported ${r.count} rows (.xls) → ${r.filePath}`);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Supplier Ledger</h1>
      <div className="flex gap-2 mb-3 items-end">
        <label>Supplier<select value={sel} onChange={(e) => setSel(e.target.value)} className="w-72">{suppliers.map((s) => <option key={s._id} value={s._id}>{s.accountName} · {s.city}</option>)}</select></label>
        {account && <span className="text-sm ml-auto">Opening ₹{inr(opening)} {account.balanceType} · Debits ₹{inr(debit)} · Closing ₹{inr(closing)}</span>}
        <button className="btn-ghost" onClick={exportXls}>.xls Export</button>
      </div>
      {msg && <div className="text-xs text-amber-300 mb-2">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-[60vh]">
        <table className="tbl">
          <thead><tr><th>Date</th><th>Bill</th><th>Debit</th><th>Credit</th><th>Running</th></tr></thead>
          <tbody>
            <tr><td colSpan={3}>Opening Balance ({account?.balanceType})</td><td></td><td className="font-mono">{inr(opening)}</td></tr>
            {invoices.map((r) => (
              <tr key={r._id}><td>{new Date(r.date).toLocaleDateString('en-IN')}</td><td className="font-mono">{r.purchaseBillNo}</td><td className="font-mono">{inr(r.totalPurchaseAmount)}</td><td></td><td></td></tr>
            ))}
            <tr><td colSpan={4} className="font-bold">Closing Balance</td><td className="font-mono font-bold">{inr(closing)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
