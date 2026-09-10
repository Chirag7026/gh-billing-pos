import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pos, unwrap, inr } from '../lib/api';

interface BatchRow { barcode: string; name: string; qty: number; copies: number; }

export default function BarcodePrint() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [opts, setOpts] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [copies, setCopies] = useState(12);
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState('');
  const [batch, setBatch] = useState<BatchRow[]>([]);

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

  // Intake 1: ?barcode=X&copies=N (Product Add → Save & Barcode).
  // Intake 2: ?batch=1 reads sessionStorage 'gh-label-batch' [{barcode,name,qty}]
  // written by Purchase Add → Save & Print Barcode (copies default to purch. qty).
  useEffect(() => {
    const bc = params.get('barcode');
    if (bc) {
      (async () => {
        try {
          const p: any = await unwrap(pos().products.getByBarcode(bc));
          if (p) {
            setSel(p);
            const n = Math.max(1, Math.min(999, Number(params.get('copies')) || 1));
            setCopies(n);
            const r: any = await unwrap(
              pos().labels.preview({ title: p.name.slice(0, 24), pack: p.convFactor || 1, code: p.barcode, barcodeData: p.barcode, copies: 1 })
            );
            setPreview(r.tspl);
            setMsg(`Loaded ${p.barcode} — adjust quantity, then Print Batch.`);
          } else setMsg(`No product for barcode ${bc}.`);
        } catch (e: any) {
          setMsg(e.message);
        }
        setParams({});
      })();
      return;
    }
    if (params.get('batch')) {
      try {
        const raw = sessionStorage.getItem('gh-label-batch');
        sessionStorage.removeItem('gh-label-batch');
        const arr = raw ? JSON.parse(raw) : [];
        if (Array.isArray(arr) && arr.length) {
          setBatch(arr.map((it: any) => ({ barcode: String(it.barcode), name: String(it.name || it.barcode), qty: Number(it.qty) || 0, copies: Math.max(1, Number(it.qty) || 1) })));
          setMsg(`Loaded ${arr.length} purchased item(s) — adjust counts, then Print All.`);
        }
      } catch {}
      setParams({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const printAll = async () => {
    setMsg('');
    if (!batch.length) return;
    try {
      const jobs = batch.map((b) => ({ title: b.name.slice(0, 24), pack: 1, code: b.barcode, barcodeData: b.barcode, copies: Math.max(1, Math.min(999, b.copies)) }));
      const r: any = await unwrap(pos().labels.print(jobs));
      const total = jobs.reduce((a, j) => a + j.copies, 0);
      setMsg(r.ok ? `Sent ${total} label(s) across ${jobs.length} item(s) via ${r.via}.` : `Print failed: ${r.error}`);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div>
      <h1 className="ptitle">Barcode Print <span className="text-xs text-slate-400 font-normal">50mm × 25mm</span></h1>
      <div className="card mb-3 grid md:grid-cols-12 gap-3 items-end">
        <label className="lbl relative md:col-span-5">Search Barcode / Alias / Name
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Wildcard supported (* ? %)…" className="mono" autoFocus />
          {opts.length > 0 && (
            <div className="dd">
              {opts.map((p) => (
                <div key={p._id} className="opt" onClick={() => pick(p)}>
                  <span className="mono text-slate-400">{p.barcode}</span> {p.name}
                </div>
              ))}
            </div>
          )}
        </label>
        <label className="lbl md:col-span-3">Number of Barcode Labels to Print<input type="number" min={1} max={999} value={copies} onChange={(e) => setCopies(Number(e.target.value))} /></label>
        <div className="md:col-span-4 flex items-end">
          <button className="btn btn-primary w-full" onClick={print}>Print Batch</button>
        </div>
      </div>
      {sel && (
        <div className="card mb-3 grid md:grid-cols-2 gap-3">
          <div>
            <div className="font-bold text-lg">{sel.name}</div>
            <div className="text-sm mono text-slate-400">Barcode {sel.barcode} · Alias {sel.alias || '—'} · Pack {sel.convFactor || 1}</div>
            <div className="text-sm mt-1">MRP ₹{inr(sel.mrp)} · WH ₹{inr(sel.whRate)} · RT ₹{inr(sel.rtRate)} · Stock {sel.cloQty}</div>
          </div>
          <div>
            <div className="label-50x25">
              <div style={{ fontSize: 9, fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden' }}>{sel.name}</div>
              <div style={{ fontSize: 14, letterSpacing: 4 }}>▮▮ ▮▮▮ ▮ ▮▮ {sel.barcode}</div>
              <div style={{ fontSize: 8 }}>MRP ₹{inr(sel.mrp)} · PK {sel.convFactor || 1}</div>
            </div>
            {preview && <pre className="code mt-2">{preview}</pre>}
          </div>
        </div>
      )}
      {batch.length > 0 && (
        <div className="card mb-3">
          <h2 className="font-bold mb-2">Purchase batch — counts default to purchased qty</h2>
          {batch.map((b, i) => (
            <div key={b.barcode + i} className="flex items-center gap-2 py-1 border-b border-slate-800">
              <span className="font-mono text-xs w-20">{b.barcode}</span>
              <span className="text-sm flex-1 truncate">{b.name}</span>
              <span className="text-[11px] text-slate-400">purch. {b.qty}</span>
              <input type="number" min={1} max={999} value={b.copies} onChange={(e) => setBatch((p) => p.map((x, j) => (j === i ? { ...x, copies: Math.max(1, Number(e.target.value)) } : x)))} className="w-20" />
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <button className="btn btn-primary" onClick={printAll}>Print All</button>
            <button className="btn btn-ghost" onClick={() => setBatch([])}>Clear Batch</button>
          </div>
        </div>
      )}
      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}
