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
      <h1 className="ptitle">Stock Adjustment</h1>
      <div className="card grid md:grid-cols-12 gap-3 mb-3 items-end">
        <label className="lbl relative md:col-span-5">Search Barcode / Alias / Name
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Wildcard supported (* ? %)…" className="mono" autoFocus />
          {opts.length > 0 && (
            <div className="dd">
              {opts.map((p) => (
                <div
                  key={p._id}
                  className="opt"
                  onClick={() => { setSel(p); setOpts([]); setSearch(''); }}
                >
                  <span className="mono text-slate-400">{p.barcode}</span> {p.name} <b>(stock {p.cloQty})</b>
                </div>
              ))}
            </div>
          )}
        </label>
        <div className="md:col-span-2 flex gap-1">
          <button className={`${mode === 'ADD' ? 'btn btn-primary' : 'btn btn-ghost'} flex-1`} onClick={() => setMode('ADD')}>+ ADD</button>
          <button className={`${mode === 'SUBTRACT' ? 'btn btn-danger' : 'btn btn-ghost'} flex-1`} onClick={() => setMode('SUBTRACT')}>− SUB</button>
        </div>
        <label className="lbl md:col-span-2">Quantity<input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} /></label>
        <label className="lbl md:col-span-3">Reason<select value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
      </div>
      {sel && (
        <div className="card mb-3 flex items-center gap-4 flex-wrap">
          <div><div className="font-bold">{sel.name}</div><div className="text-xs mono text-slate-400">{sel.barcode} · {sel.alias}</div></div>
          <div className="ml-auto text-right"><div className="text-sm">Current stock</div><b className="mono text-xl">{sel.cloQty}</b></div>
          <button className="btn btn-primary" onClick={submit}>Apply Adjustment</button>
        </div>
      )}
      {msg && <div className="text-sm text-amber-300 mb-2">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-40vh">
        <table className="tbl">
          <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Prev → New</th><th>Reason</th><th>By</th></tr></thead>
          <tbody>
            {log.map((r) => (
              <tr key={r._id}>
                <td>{new Date(r.date).toLocaleString('en-IN')}</td><td>{r.productName}<div className="text-slate-400 mono" style={{ fontSize: 11 }}>{r.barcode}</div></td>
                <td>{r.adjustmentType}</td><td className="mono">{r.adjustedQty}</td>
                <td className="mono">{r.previousQty} → {r.newQty}</td><td>{r.reason}</td><td>{r.adjustedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
