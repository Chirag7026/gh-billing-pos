import { useEffect, useState } from 'react';
import { pos, unwrap } from '../lib/api';
import { useSession } from '../hooks/useSession';

const REASONS = ['DAMAGE', 'EXPIRY', 'AUDIT VARIANCE', 'CORRECTION'];

export default function StockAdjustmentPage() {
  const { session } = useSession();
  const [search, setSearch] = useState('');
  const [opts, setOpts] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [mode, setMode] = useState<'ADD' | 'SUBTRACT'>('ADD');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('AUDIT VARIANCE');
  const [msg, setMsg] = useState('');
  const [log, setLog] = useState<any[]>([]);

  useEffect(() => {
    if (!search.trim()) {
      setOpts([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setOpts(await unwrap<any[]>(pos().products.list({ search, limit: 20 })));
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  const loadLog = async () => {
    try {
      setLog(await unwrap<any[]>(pos().stock.adjustments(100)));
    } catch {}
  };
  useEffect(() => {
    loadLog();
  }, []);

  const submit = async () => {
    setMsg('');
    if (!sel) {
      setMsg('Select an item first.');
      return;
    }
    try {
      const r: any = await unwrap(pos().stock.adjust({ productId: sel._id, mode, qty, reason, by: session.username || 'UNKNOWN' }));
      setSel({ ...sel, cloQty: r.newQty });
      setMsg(`Adjusted ${mode === 'ADD' ? '+' : '−'}${qty} → new stock ${r.newQty}. Audit record written.`);
      loadLog();
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Stock Adjustment</h1>
      <div className="card grid md:grid-cols-2 gap-3 mb-3">
        <label className="relative">Search Barcode / Alias / Name
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Wildcard supported (* ? %)…" className="font-mono" autoFocus />
          {opts.length > 0 && (
            <div className="absolute z-10 bg-slate-800 border border-slate-700 rounded w-full max-h-44 overflow-auto">
              {opts.map((p) => (
                <div
                  key={p._id}
                  className="px-2 py-1 hover:bg-slate-700 cursor-pointer text-sm"
                  onClick={() => { setSel(p); setOpts([]); setSearch(''); }}
                >
                  <span className="font-mono text-slate-400">{p.barcode}</span> {p.name} <b>(stock {p.cloQty})</b>
                </div>
              ))}
            </div>
          )}
        </label>
        <div className="grid grid-cols-3 gap-2 items-end">
          <div className="flex gap-1">
            <button className={`${mode === 'ADD' ? 'btn-primary' : 'btn-ghost'} flex-1`} onClick={() => setMode('ADD')}>+ ADD</button>
            <button className={`${mode === 'SUBTRACT' ? 'btn-danger' : 'btn-ghost'} flex-1`} onClick={() => setMode('SUBTRACT')}>− SUB</button>
          </div>
          <label>Quantity<input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} /></label>
          <label>Reason<select value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
        </div>
      </div>
      {sel && (
        <div className="card mb-3 flex items-center gap-4 flex-wrap">
          <div><div className="font-bold">{sel.name}</div><div className="text-xs font-mono text-slate-400">{sel.barcode} · {sel.alias}</div></div>
          <div className="ml-auto text-right"><div className="text-sm">Current stock</div><b className="font-mono text-xl">{sel.cloQty}</b></div>
          <button className="btn-primary" onClick={submit}>Apply Adjustment</button>
        </div>
      )}
      {msg && <div className="text-sm text-amber-300 mb-2">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-[40vh]">
        <table className="tbl">
          <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Prev → New</th><th>Reason</th><th>By</th></tr></thead>
          <tbody>
            {log.map((r) => (
              <tr key={r._id}>
                <td>{new Date(r.date).toLocaleString('en-IN')}</td><td>{r.productName}<div className="text-[11px] font-mono text-slate-400">{r.barcode}</div></td>
                <td>{r.adjustmentType}</td><td className="font-mono">{r.adjustedQty}</td>
                <td className="font-mono">{r.previousQty} → {r.newQty}</td><td>{r.reason}</td><td>{r.adjustedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
