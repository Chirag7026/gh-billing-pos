import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pos, unwrap, inr, num } from '../lib/api';
import { useScanner } from '../hooks/useScanner';
import { setUnsaved } from '../lib/unsaved';
import { beepNotFound } from '../lib/beep';
import { prefs, beepSeconds } from '../lib/prefs';

interface Row { key: string; productId?: string; name: string; barcode: string; qty: number; purRate: number; mrp: number; whRate: number; rtRate: number; amount: number; }

export default function PurchaseAdd() {
  const [params, setParams] = useSearchParams();
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [supSearch, setSupSearch] = useState('');
  const [supOpts, setSupOpts] = useState<any[]>([]);
  const [billNo, setBillNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentType, setPaymentType] = useState<'Cash' | 'Debit'>('Cash');
  const [scan, setScan] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [nameOpts, setNameOpts] = useState<any[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState('');
  const [labelModal, setLabelModal] = useState(false);
  const [labelCounts, setLabelCounts] = useState<Record<string, number>>({});
  const [labelPreview, setLabelPreview] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  // Unsaved-bill guard for the TitleBar ✕ safety modal.
  useEffect(() => {
    setUnsaved('purchase', rows.length > 0);
  }, [rows.length]);
  useEffect(() => () => setUnsaved('purchase', false), []);
  useEffect(() => {
    scanRef.current?.focus();
    // Edit flow: ?edit=<purchaseId> loads the invoice (stock reversed on re-save).
    const editId = params.get('edit');
    if (editId) {
      (async () => {
        try {
          const b: any = await unwrap(pos().purchases.get(editId));
          if (b) {
            setEditingId(b._id);
            setBillNo(b.purchaseBillNo);
            setDate(new Date(b.date).toISOString().slice(0, 10));
            setSupplierId(b.supplierId);
            setSupplierName(b.supplierName);
            setPaymentType(b.paymentType);
            setRows(
              (b.items || []).map((it: any, i: number) => ({
                key: `${it.barcode}-edit-${i}`,
                productId: it.productId, name: it.name, barcode: it.barcode,
                qty: num(it.qty), purRate: num(it.purRate), mrp: num(it.mrp),
                whRate: num(it.whRate), rtRate: num(it.rtRate), amount: num(it.amount)
              }))
            );
            setMsg(`Editing purchase ${b.purchaseBillNo} — re-saving reverses old stock first.`);
            setParams({});
          }
        } catch (e: any) {
          setMsg(e.message);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!supSearch.trim()) {
      setSupOpts([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setSupOpts(await unwrap<any[]>(pos().ledgers.list({ search: supSearch })));
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [supSearch]);
  useEffect(() => {
    if (!nameSearch.trim()) {
      setNameOpts([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setNameOpts(await unwrap<any[]>(pos().products.list({ search: nameSearch, limit: 20 })));
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [nameSearch]);

  const addProduct = (p: any) => {
    setRows((prev) => {
      if (prev.some((r) => r.barcode === p.barcode)) return prev;
      return [...prev, { key: `${p.barcode}-${Date.now()}`, productId: p._id, name: p.name, barcode: p.barcode, qty: 1, purRate: num(p.purRate), mrp: num(p.mrp), whRate: num(p.whRate), rtRate: num(p.rtRate), amount: num(p.purRate) }];
    });
    setScan('');
    setNameSearch('');
    setNameOpts([]);
    // Back-to-back scanning: clear + keep focus on the barcode input.
    requestAnimationFrame(() => {
      scanRef.current?.focus();
      scanRef.current?.select();
    });
  };

  const handleScan = async (code: string) => {
    setScan('');
    try {
      const p: any = await unwrap(pos().products.getByBarcode(code));
      if (p) addProduct(p);
      else {
        // Unknown barcode → create row shell so rates can be entered inline
        setRows((prev) => [...prev, { key: `${code}-${Date.now()}`, name: code, barcode: code, qty: 1, purRate: 0, mrp: 0, whRate: 0, rtRate: 0, amount: 0 }]);
        setMsg(`New barcode ${code}: fill name + rates inline.`);
        beepNotFound(await beepSeconds());
      }
    } catch (e: any) {
      setMsg(e.message);
    }
    scanRef.current?.focus();
  };
  useScanner({ onScan: handleScan });

  const patch = (key: string, k: keyof Row, v: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const n = { ...r, [k]: v } as Row;
        n.amount = +(num(n.qty) * num(n.purRate)).toFixed(2);
        return n;
      })
    );
  };

  const total = rows.reduce((a, r) => a + num(r.amount), 0);

  const save = async (withLabels: boolean) => {
    setMsg('');
    // Auto-Print Barcode toggle: plain Save routes into the label modal.
    if (!withLabels && !labelModal) {
      try {
        const p = await prefs();
        if (p.autoPrintBarcode) {
          const m: any = {};
          rows.forEach((r) => (m[r.key] = 1));
          setLabelCounts(m);
          setLabelModal(true);
          return;
        }
      } catch {}
    }
    try {
      let printLabels: any[] | undefined;
      if (withLabels) {
        printLabels = rows.map((r) => ({
          title: r.name.slice(0, 24),
          pack: 1,
          code: r.barcode,
          barcodeData: r.barcode,
          copies: labelCounts[r.key] ?? 1
        }));
      }
      const bill = { _id: editingId, purchaseBillNo: billNo, date, supplierId, supplierName, paymentType, items: rows.map(({ key: _k, ...r }) => r) };
      const r: any = await unwrap(pos().purchases.save(bill, printLabels));
      setMsg(`Saved purchase ${r.bill.purchaseBillNo} · ₹${inr(r.bill.totalPurchaseAmount)}${withLabels ? ' · labels sent' : ''}`);
      setRows([]);
      setEditingId(undefined);
      setBillNo('');
      setLabelModal(false);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const previewLabel = async (r: Row) => {
    const job = { title: r.name.slice(0, 24), pack: 1, code: r.barcode, barcodeData: r.barcode, copies: 1 };
    const p: any = await unwrap(pos().labels.preview(job));
    setLabelPreview(p.tspl);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Purchase Add + Barcode <span className="kbd ml-2">F5</span></h1>
      <div className="card mb-3 grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <label className="relative col-span-2">Supplier
          <input value={supSearch || supplierName} onChange={(e) => { setSupSearch(e.target.value); setSupplierName(e.target.value); }} placeholder="Search supplier…" />
          {supOpts.length > 0 && (
            <div className="absolute z-10 bg-slate-800 border border-slate-700 rounded w-full max-h-40 overflow-auto">
              {supOpts.map((c) => (
                <div key={c._id} className="px-2 py-1 hover:bg-slate-700 cursor-pointer text-sm" onClick={() => { setSupplierId(c._id); setSupplierName(c.accountName); setSupSearch(''); setSupOpts([]); }}>{c.accountName}</div>
              ))}
            </div>
          )}
        </label>
        <label>Bill No<input value={billNo} onChange={(e) => setBillNo(e.target.value)} className="font-mono" /></label>
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <div className="flex gap-1">{(['Cash', 'Debit'] as const).map((t) => <button key={t} className={`${paymentType === t ? 'btn-primary' : 'btn-ghost'} flex-1`} onClick={() => setPaymentType(t)}>{t}</button>)}</div>
      </div>

      <div className="card mb-3 grid md:grid-cols-2 gap-2">
        <label>Scan barcode<input ref={scanRef} data-barcode-field="true" value={scan} onChange={(e) => setScan(e.target.value)} className="font-mono" autoFocus /></label>
        <label className="relative">…or type name
          <input value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} />
          {nameOpts.length > 0 && (
            <div className="absolute z-10 bg-slate-800 border border-slate-700 rounded w-full max-h-44 overflow-auto">
              {nameOpts.map((p) => (
                <div key={p._id} className="px-2 py-1 hover:bg-slate-700 cursor-pointer text-sm" onClick={() => addProduct(p)}><span className="font-mono text-slate-400">{p.barcode}</span> {p.name}</div>
              ))}
            </div>
          )}
        </label>
      </div>

      <div className="card p-0 overflow-auto max-h-[38vh] mb-3">
        <table className="tbl">
          <thead><tr><th>Barcode</th><th>Name</th><th>Qty</th><th>Pur</th><th>MRP</th><th>WH</th><th>RT</th><th>Amt</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="font-mono">{r.barcode}</td>
                <td><input value={r.name} onChange={(e) => patch(r.key, 'name', e.target.value)} className="w-44" /></td>
                <td><input type="number" value={r.qty} onChange={(e) => patch(r.key, 'qty', Number(e.target.value))} className="w-16" /></td>
                <td><input type="number" value={r.purRate} onChange={(e) => patch(r.key, 'purRate', Number(e.target.value))} className="w-20" /></td>
                <td><input type="number" value={r.mrp} onChange={(e) => patch(r.key, 'mrp', Number(e.target.value))} className="w-20" /></td>
                <td><input type="number" value={r.whRate} onChange={(e) => patch(r.key, 'whRate', Number(e.target.value))} className="w-20" /></td>
                <td><input type="number" value={r.rtRate} onChange={(e) => patch(r.key, 'rtRate', Number(e.target.value))} className="w-20" /></td>
                <td className="font-mono">{inr(r.amount)}</td>
                <td><button className="btn-danger" onClick={() => { setRows((p) => p.filter((x) => x.key !== r.key)); previewLabel(r); }}>✕</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="text-center text-slate-500 py-6">Scan or search to add purchase rows…</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <div>Total Purchase <b className="font-mono text-emerald-300 text-xl">₹{inr(total)}</b></div>
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost" onClick={() => save(false)}>Save</button>
          <button className="btn-primary" onClick={() => { const m: any = {}; rows.forEach((r) => (m[r.key] = 1)); setLabelCounts(m); setLabelModal(true); }}>Save & Print Barcode</button>
        </div>
      </div>
      {msg && <div className="text-sm text-amber-300 mt-2">{msg}</div>}

      {labelModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="card w-full max-w-xl max-h-[90vh] overflow-auto">
            <h2 className="font-bold mb-2">Labels per item (50mm × 25mm)</h2>
            {rows.map((r) => (
              <div key={r.key} className="flex items-center gap-2 py-1 border-b border-slate-800">
                <span className="font-mono text-xs w-20">{r.barcode}</span>
                <span className="text-sm flex-1 truncate">{r.name}</span>
                <input type="number" min={1} max={999} value={labelCounts[r.key] ?? 1} onChange={(e) => setLabelCounts((p) => ({ ...p, [r.key]: Math.max(1, Number(e.target.value)) }))} className="w-20" />
              </div>
            ))}
            {labelPreview && <pre className="text-[11px] font-mono bg-slate-950 p-2 rounded mt-2 whitespace-pre-wrap">{labelPreview}</pre>}
            <div className="flex gap-2 mt-3">
              <button className="btn-primary" onClick={() => save(true)}>Print batch</button>
              <button className="btn-ghost" onClick={() => setLabelModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
