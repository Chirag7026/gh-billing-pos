import { useEffect, useState } from 'react';
import { pos, unwrap, inr } from '../lib/api';

export default function BarcodePrint() {
  const [search, setSearch] = useState('');
  const [opts, setOpts] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [copies, setCopies] = useState(12);
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState('');

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

  const pick = async (p: any) => {
    setSel(p);
    setOpts([]);
    setSearch('');
    try {
      const r: any = await unwrap(
        pos().labels.preview({ title: p.name.slice(0, 24), pack: p.convFactor || 1, code: p.barcode, barcodeData: p.barcode, copies: 1 })
      );
      setPreview(r.tspl);
    } catch {}
  };

  const print = async () => {
    setMsg('');
    if (!sel) {
      setMsg('Search and select an item first.');
      return;
    }
    const n = Math.max(1, Math.min(999, Number(copies) || 1));
    try {
      const r: any = await unwrap(
        pos().labels.print([{ title: sel.name.slice(0, 24), pack: sel.convFactor || 1, code: sel.barcode, barcodeData: sel.barcode, copies: n }])
      );
      setMsg(r.ok ? `Sent ${n} label(s) × ${sel.barcode} via ${r.via}.` : `Print failed: ${r.error}`);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Barcode Print <span className="text-xs text-slate-400 font-normal">50mm × 25mm</span></h1>
      <div className="card mb-3 grid md:grid-cols-2 gap-3">
        <label className="relative">Search Barcode / Alias / Name
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Wildcard supported (* ? %)…" className="font-mono" autoFocus />
          {opts.length > 0 && (
            <div className="absolute z-10 bg-slate-800 border border-slate-700 rounded w-full max-h-44 overflow-auto">
              {opts.map((p) => (
                <div key={p._id} className="px-2 py-1 hover:bg-slate-700 cursor-pointer text-sm" onClick={() => pick(p)}>
                  <span className="font-mono text-slate-400">{p.barcode}</span> {p.name}
                </div>
              ))}
            </div>
          )}
        </label>
        <div className="grid grid-cols-2 gap-2 items-end">
          <label>Number of Barcode Labels to Print<input type="number" min={1} max={999} value={copies} onChange={(e) => setCopies(Number(e.target.value))} /></label>
          <button className="btn-primary" onClick={print}>Print Batch</button>
        </div>
      </div>
      {sel && (
        <div className="card mb-3 grid md:grid-cols-2 gap-3">
          <div>
            <div className="font-bold text-lg">{sel.name}</div>
            <div className="text-sm font-mono text-slate-400">Barcode {sel.barcode} · Alias {sel.alias || '—'} · Pack {sel.convFactor || 1}</div>
            <div className="text-sm mt-1">MRP ₹{inr(sel.mrp)} · WH ₹{inr(sel.whRate)} · RT ₹{inr(sel.rtRate)} · Stock {sel.cloQty}</div>
          </div>
          {preview && <pre className="text-[11px] font-mono bg-slate-950 p-2 rounded whitespace-pre-wrap">{preview}</pre>}
        </div>
      )}
      {msg && <div className="text-sm text-amber-300">{msg}</div>}
    </div>
  );
}
