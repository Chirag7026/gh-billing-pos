import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pos, unwrap, inr, num } from '../lib/api';
import { useScanner } from '../hooks/useScanner';
import { setUnsaved } from '../lib/unsaved';
import { beepNotFound } from '../lib/beep';
import { prefs, beepSeconds } from '../lib/prefs';

interface Row {
  key: string; productId?: string; name: string; barcode: string; alias: string;
  pack: number; qty: number; unit: string; rate: number; gstRate: number; gstAmount: number; amount: number;
}

function lineGst(amount: number, gstRate: number, gstType: string): number {
  const g = Number(gstRate) || 0;
  if (!g) return 0;
  if (gstType === 'GST Included') return +(amount - amount / (1 + g / 100)).toFixed(2);
  return +(amount * (g / 100)).toFixed(2);
}

export default function SaleAdd() {
  const [params, setParams] = useSearchParams();
  const [paymentType, setPaymentType] = useState<'Cash' | 'Debit'>('Cash');
  const [pricingMode, setPricingMode] = useState<'Wholesale' | 'Retail'>('Wholesale');
  const [cartMode, setCartMode] = useState<'ADD' | 'REMOVE'>('ADD');
  const [billNo, setBillNo] = useState('');
  const [date, setDate] = useState('');
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [customerName, setCustomerName] = useState('12345678 CASH');
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [custSearch, setCustSearch] = useState('');
  const [custOpts, setCustOpts] = useState<any[]>([]);
  const [scan, setScan] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [nameOpts, setNameOpts] = useState<any[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState('');
  const [autoPrint, setAutoPrint] = useState(true);
  const scanRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef(cartMode);
  modeRef.current = cartMode;

  // Unsaved-bill guard for the TitleBar ✕ safety modal.
  useEffect(() => {
    setUnsaved('sale', rows.length > 0);
  }, [rows.length]);
  useEffect(() => () => setUnsaved('sale', false), []);

  const freshBillNo = async () => {
    try {
      const r: any = await unwrap(pos().sales.nextBillNo());
      setBillNo(r.next);
      setDate(r.date);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const p = await prefs();
        setAutoPrint(p.autoPrintReceipt !== false);
      } catch {}
      // Edit flow: ?edit=<saleId> loads the bill into the cart (Module 5).
      const editId = params.get('edit');
      if (editId) {
        try {
          const b: any = await unwrap(pos().sales.get(editId));
          if (b) {
            setEditingId(b._id);
            setBillNo(b.billNo);
            setDate(b.date);
            setPaymentType(b.paymentType);
            setPricingMode(b.pricingMode);
            setCustomerId(b.customerId);
            setCustomerName(b.customerName);
            setRows(
              (b.items || []).map((it: any, i: number) => ({
                key: `${it.barcode}-edit-${i}`,
                productId: it.productId,
                name: it.name,
                barcode: it.barcode,
                alias: it.alias || '',
                pack: num(it.pack, 1),
                qty: num(it.qty),
                unit: it.unit || 'Pcs',
                rate: num(it.rate),
                gstRate: 0,
                gstAmount: num(it.gstAmount),
                amount: num(it.amount)
              }))
            );
            setMsg(`Editing bill ${b.billNo} — re-saving recalculates stock differences.`);
            setParams({});
          } else await freshBillNo();
        } catch (e: any) {
          setMsg(e.message);
          await freshBillNo();
        }
      } else await freshBillNo();
    })();
    scanRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F10 / Space toggles ADD vs REMOVE (not while typing in a field/button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const tag = (t?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (e.key === 'F10' || e.key === ' ') {
        e.preventDefault();
        setCartMode((m) => (m === 'ADD' ? 'REMOVE' : 'ADD'));
      }
      if (e.key === 'F9') {
        e.preventDefault();
        void saveRef.current(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Customer quick search
  useEffect(() => {
    if (!custSearch.trim()) {
      setCustOpts([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setCustOpts(await unwrap<any[]>(pos().ledgers.list({ search: custSearch, group: undefined })));
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [custSearch]);

  // Live product search by name
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

  const rateFor = (p: any) => (pricingMode === 'Wholesale' ? num(p.whRate) : num(p.rtRate));

  /** ADD: +1 (append if new). REMOVE: −1, drop row at 0. No delete buttons. */
  const applyProduct = (p: any) => {
    const remove = modeRef.current === 'REMOVE';
    const rate = rateFor(p);
    const pack = num(p.convFactor, 1) || 1;
    const gstRate = num(p.gstRate);
    const gstType = p.gstType || 'GST On Rate';
    let removed = false;
    let missing = false;
    setRows((prev) => {
      const i = prev.findIndex((r) => r.barcode === p.barcode);
      if (i < 0) {
        if (remove) {
          missing = true;
          return prev;
        }
        const amount = +(1 * rate).toFixed(2);
        return [
          ...prev,
          {
            key: `${p.barcode}-${Date.now()}`, productId: p._id, name: p.name, barcode: p.barcode,
            alias: p.alias || p.barcode, pack, qty: 1, unit: p.unit || 'Pcs', rate,
            gstRate, gstAmount: lineGst(amount, gstRate, gstType), amount
          }
        ];
      }
      const next = [...prev];
      const qty = num(next[i].qty) + (remove ? -1 : 1);
      if (qty <= 0) {
        removed = true;
        next.splice(i, 1);
        return next;
      }
      const amount = +(qty * next[i].rate).toFixed(2);
      next[i] = { ...next[i], qty, amount, gstAmount: lineGst(amount, next[i].gstRate, gstType) };
      return next;
    });
    if (missing) setMsg(`${p.name} is not on this bill — REMOVE mode needs it in the cart.`);
    else if (removed) setMsg(`${p.name} removed (qty reached 0).`);
    else setMsg('');
    setScan('');
    setNameSearch('');
    setNameOpts([]);
    requestAnimationFrame(() => {
      scanRef.current?.focus();
      scanRef.current?.select();
    });
  };

  const handleScanCode = async (code: string) => {
    setMsg('');
    setScan('');
    try {
      const p: any = await unwrap(pos().products.getByBarcode(code));
      if (!p) {
        setMsg(`No product for barcode ${code} — search by name to map it.`);
        beepNotFound(await beepSeconds());
        setNameSearch(code);
        scanRef.current?.focus();
        return;
      }
      applyProduct(p);
    } catch (e: any) {
      setMsg(e.message);
      scanRef.current?.focus();
    }
  };

  // High-speed wedge-scanner trap
  useScanner({ onScan: handleScanCode });

  const submitScan = async () => {
    if (scan.trim()) await handleScanCode(scan.trim());
  };

  // Re-rate all rows when Wholesale/Retail toggles
  const toggleMode = async (m: 'Wholesale' | 'Retail') => {
    setPricingMode(m);
    const next = await Promise.all(
      rows.map(async (r) => {
        try {
          const p: any = await unwrap(pos().products.getByBarcode(r.barcode));
          if (p) {
            const rate = m === 'Wholesale' ? num(p.whRate) : num(p.rtRate);
            const amount = +(num(r.qty) * rate).toFixed(2);
            return { ...r, rate, pack: num(p.convFactor, 1) || r.pack, gstAmount: lineGst(amount, num(p.gstRate), p.gstType), amount };
          }
        } catch {}
        return r;
      })
    );
    setRows(next);
  };

  const totals = useMemo(() => {
    const sub = rows.reduce((a, r) => a + num(r.amount), 0);
    return {
      items: rows.length,
      packQty: rows.reduce((a, r) => a + num(r.qty), 0),
      units: rows.reduce((a, r) => a + num(r.qty) * num(r.pack), 0),
      sub
    };
  }, [rows]);

  const patchRow = (key: string, k: keyof Row, v: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const n = { ...r, [k]: v } as Row;
        if (k === 'qty' || k === 'rate') {
          n.amount = +(num(n.qty) * num(n.rate)).toFixed(2);
          n.gstAmount = lineGst(n.amount, n.gstRate, 'GST On Rate');
        }
        return n;
      })
    );
  };

  const resetForm = async () => {
    setRows([]);
    setEditingId(undefined);
    setCustomerName('12345678 CASH');
    setCustomerId(undefined);
    setCustSearch('');
    await freshBillNo();
    scanRef.current?.focus();
  };

  const save = async (print: boolean) => {
    setMsg('');
    if (!rows.length) {
      setMsg('Cart is empty.');
      return;
    }
    try {
      const bill = {
        _id: editingId,
        billNo, date, time: new Date().toLocaleTimeString('en-GB'),
        paymentType, pricingMode, customerId, customerName,
        items: rows.map(({ key: _k, gstRate: _g, ...r }) => r)
      };
      const doPrint = print && autoPrint;
      const r: any = await unwrap(pos().sales.save(bill, doPrint));
      if (print && !autoPrint) setMsg(`Saved bill ${r.bill.billNo} (auto-print OFF in Settings).`);
      else if (doPrint && r.print && !r.print.ok) setMsg(`Saved ${r.bill.billNo}, but print failed: ${r.print.error}`);
      else setMsg(`Saved bill ${r.bill.billNo}${doPrint ? ' + printed' : ''}.`);
      await resetForm();
    } catch (e: any) {
      // Collision-proof numbering: retake max+1 on duplicate and retry once.
      if (/duplicate|E11000|already/i.test(e.message)) {
        try {
          await freshBillNo();
          setMsg(`${e.message} — new bill no. allotted, press Save again.`);
        } catch {}
      } else setMsg(e.message);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Sales Invoice Add <span className="kbd ml-2">F1</span></h1>
      <div className="card mb-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
        <div className="flex gap-1">
          {(['Cash', 'Debit'] as const).map((t) => (
            <button key={t} className={`${paymentType === t ? 'btn-primary' : 'btn-ghost'} flex-1`} onClick={() => setPaymentType(t)}>{t}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['Wholesale', 'Retail'] as const).map((m) => (
            <button key={m} className={`${pricingMode === m ? 'btn-amber' : 'btn-ghost'} flex-1`} onClick={() => toggleMode(m)}>{m === 'Wholesale' ? 'WH' : 'RT'}</button>
          ))}
        </div>
        <div className="col-span-2">
          <button
            onClick={() => setCartMode((m) => (m === 'ADD' ? 'REMOVE' : 'ADD'))}
            title="Toggle with F10 or Space"
            className={cartMode === 'ADD' ? 'btn-primary w-full' : 'btn-danger w-full'}
          >
            {cartMode === 'ADD' ? '+ ADD MODE' : '− REMOVE MODE'} <span className="kbd ml-1">F10</span>
          </button>
        </div>
        <label>Bill No<input value={billNo} onChange={(e) => setBillNo(e.target.value)} className="font-mono" /></label>
        <label>Date<input value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="col-span-2 relative">Customer
          <input value={custSearch || customerName} onChange={(e) => { setCustSearch(e.target.value); setCustomerName(e.target.value); }} placeholder="Search / quick-add…" />
          {custOpts.length > 0 && (
            <div className="absolute z-10 bg-slate-800 border border-slate-700 rounded w-full max-h-40 overflow-auto">
              {custOpts.map((c) => (
                <div key={c._id} className="px-2 py-1 hover:bg-slate-700 cursor-pointer text-sm" onClick={() => { setCustomerId(c._id); setCustomerName(c.accountName); setCustSearch(''); setCustOpts([]); }}>
                  {c.accountName} <span className="text-slate-400">· {c.city}</span>
                </div>
              ))}
              <div className="px-2 py-1 text-emerald-300 cursor-pointer text-sm" onClick={async () => { const c: any = await unwrap(pos().ledgers.save({ accountName: customerName, group: 'Sundry Debtors' })); setCustomerId(c._id); setCustOpts([]); setCustSearch(''); }}>+ Quick-add “{customerName}”</div>
            </div>
          )}
        </label>
      </div>

      <div className="card mb-3 grid md:grid-cols-2 gap-2">
        <label className="relative">Scanner input (auto-focus trap)
          <div className="flex gap-2">
            <input ref={scanRef} data-barcode-field="true" value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan barcode…" className="font-mono flex-1" autoFocus />
            <button className="btn-primary" onClick={submitScan}>{cartMode === 'ADD' ? 'Add' : 'Remove'}</button>
          </div>
        </label>
        <label className="relative">…or type name
          <input value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} placeholder="Live search by name…" />
          {nameOpts.length > 0 && (
            <div className="absolute z-10 bg-slate-800 border border-slate-700 rounded w-full max-h-44 overflow-auto">
              {nameOpts.map((p) => (
                <div key={p._id} className="px-2 py-1 hover:bg-slate-700 cursor-pointer text-sm" onClick={() => applyProduct(p)}>
                  <span className="font-mono text-slate-400">{p.barcode}</span> {p.name} <b>₹{inr(rateFor(p))}</b>
                </div>
              ))}
            </div>
          )}
        </label>
      </div>

      <div className="card p-0 overflow-auto max-h-[40vh] mb-3">
        <table className="tbl sales-table">
          <thead><tr><th>#</th><th>Particulars</th><th>Pack</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td>{i + 1}</td>
                <td><div>{r.name}</div><div className="text-[11px] font-mono text-slate-400">{r.barcode}</div></td>
                <td><input type="number" value={r.pack} onChange={(e) => patchRow(r.key, 'pack', Number(e.target.value))} className="w-16" /></td>
                <td><input type="number" value={r.qty} onChange={(e) => patchRow(r.key, 'qty', Number(e.target.value))} className="w-20" /></td>
                <td><input type="number" value={r.rate} onChange={(e) => patchRow(r.key, 'rate', Number(e.target.value))} className="w-24" /></td>
                <td className="font-mono">{inr(r.amount)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="text-center text-slate-500 py-6">Scan first item to begin…</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm">Items <b>{totals.items}</b> · PackQty <b>{totals.packQty}</b> · Units <b>{totals.units.toFixed(2)}</b> · Sub <b className="font-mono">₹{inr(totals.sub)}</b></div>
        <div className="text-xl font-extrabold ml-auto">Grand Total <span className="font-mono text-emerald-300">₹{inr(totals.sub)}</span></div>
      </div>
      <div className="flex gap-2 mt-3">
        <button className="btn-primary" onClick={() => save(true)}>Save & Print <span className="kbd ml-1">F9</span></button>
        <button className="btn-ghost" onClick={() => save(false)}>Save Only</button>
        <button className="btn-danger" onClick={resetForm}>Cancel</button>
      </div>
      {msg && <div className="text-sm text-amber-300 mt-2">{msg}</div>}
    </div>
  );
}
