import { useEffect, useMemo, useRef, useState } from 'react';
import { pos, unwrap, inr, num } from '../lib/api';
import { useScanner } from '../hooks/useScanner';
import { setUnsaved } from '../lib/unsaved';

interface Row { key: string; productId?: string; name: string; barcode: string; pack: number; qty: number; unit: string; rate: number; amount: number; }

export default function SaleAdd() {
  const [paymentType, setPaymentType] = useState<'Cash' | 'Debit'>('Cash');
  const [pricingMode, setPricingMode] = useState<'Wholesale' | 'Retail'>('Wholesale');
  const [billNo, setBillNo] = useState('');
  const [date, setDate] = useState('');
  const [customerName, setCustomerName] = useState('12345678 CASH');
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [custSearch, setCustSearch] = useState('');
  const [custOpts, setCustOpts] = useState<any[]>([]);
  const [scan, setScan] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [nameOpts, setNameOpts] = useState<any[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  // Unsaved-bill guard for the TitleBar ✕ safety modal.
  useEffect(() => {
    setUnsaved('sale', rows.length > 0);
  }, [rows.length]);
  useEffect(() => () => setUnsaved('sale', false), []);

  useEffect(() => {
    (async () => {
      try {
        const r: any = await unwrap(pos().sales.nextBillNo());
        setBillNo(r.next);
        setDate(r.date);
      } catch (e: any) {
        setMsg(e.message);
      }
    })();
    scanRef.current?.focus();
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

  const addProduct = (p: any, qtyToAdd = 1) => {
    const rate = rateFor(p);
    const pack = num(p.convFactor, 1) || 1;
    setRows((prev) => {
      const i = prev.findIndex((r) => r.barcode === p.barcode);
      if (i >= 0) {
        const next = [...prev];
        const r = { ...next[i], qty: num(next[i].qty) + qtyToAdd };
        r.amount = +(r.qty * r.rate).toFixed(2);
        next[i] = r;
        return next;
      }
      return [...prev, { key: `${p.barcode}-${Date.now()}`, productId: p._id, name: p.name, barcode: p.barcode, pack, qty: qtyToAdd, unit: p.unit || 'Pcs', rate, amount: +(qtyToAdd * rate).toFixed(2) }];
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

  const handleScanCode = async (code: string) => {
    setMsg('');
    setScan('');
    try {
      const p: any = await unwrap(pos().products.getByBarcode(code));
      if (!p) {
        setMsg(`No product for barcode ${code} — search by name to map it.`);
        setNameSearch(code);
        scanRef.current?.focus();
        return;
      }
      addProduct(p);
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

  // Re-rate all rows when Wholesale/Retail toggles (spec: auto-select rate)
  const toggleMode = async (m: 'Wholesale' | 'Retail') => {
    setPricingMode(m);
    setRows((prev) =>
      prev.map((r) => {
        // Best-effort: keep manual edits; only re-rate if rate matches old mode rate. Simpler: re-fetch product.
        return r;
      })
    );
    // Re-resolve rates from master
    const next = await Promise.all(
      rows.map(async (r) => {
        try {
          const p: any = await unwrap(pos().products.getByBarcode(r.barcode));
          if (p) {
            const rate = m === 'Wholesale' ? num(p.whRate) : num(p.rtRate);
            return { ...r, rate, pack: num(p.convFactor, 1) || r.pack, amount: +(num(r.qty) * rate).toFixed(2) };
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
        if (k === 'qty' || k === 'rate') n.amount = +(num(n.qty) * num(n.rate)).toFixed(2);
        return n;
      })
    );
  };

  const resetForm = async () => {
    setRows([]);
    setCustomerName('12345678 CASH');
    setCustomerId(undefined);
    setCustSearch('');
    try {
      const r: any = await unwrap(pos().sales.nextBillNo());
      setBillNo(r.next);
      setDate(r.date);
    } catch {}
    scanRef.current?.focus();
  };

  const save = async (print: boolean) => {
    setMsg('');
    try {
      const bill = {
        billNo, date, time: new Date().toLocaleTimeString('en-GB'),
        paymentType, pricingMode, customerId, customerName,
        items: rows.map(({ key: _k, ...r }) => r)
      };
      const r: any = await unwrap(pos().sales.save(bill, print));
      if (print && r.print && !r.print.ok) setMsg(`Saved ${r.bill.billNo}, but print failed: ${r.print.error}`);
      else setMsg(`Saved bill ${r.bill.billNo}${print ? ' + printed' : ''}.`);
      await resetForm();
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Sales Invoice Add <span className="kbd ml-2">F1</span></h1>
      <div className="card mb-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
        <div className="flex gap-1">
          {(['Cash', 'Debit'] as const).map((t) => (
            <button key={t} className={paymentType === t ? 'btn-primary' : 'btn-ghost'} onClick={() => setPaymentType(t)}>{t}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['Wholesale', 'Retail'] as const).map((m) => (
            <button key={m} className={pricingMode === m ? 'btn-amber' : 'btn-ghost'} onClick={() => toggleMode(m)}>{m === 'Wholesale' ? 'WH' : 'RT'}</button>
          ))}
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
            <input ref={scanRef} data-scanner-input value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan barcode…" className="font-mono flex-1" autoFocus />
            <button className="btn-primary" onClick={submitScan}>Add</button>
          </div>
        </label>
        <label className="relative">…or type name
          <input value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} placeholder="Live search by name…" />
          {nameOpts.length > 0 && (
            <div className="absolute z-10 bg-slate-800 border border-slate-700 rounded w-full max-h-44 overflow-auto">
              {nameOpts.map((p) => (
                <div key={p._id} className="px-2 py-1 hover:bg-slate-700 cursor-pointer text-sm" onClick={() => addProduct(p)}>
                  <span className="font-mono text-slate-400">{p.barcode}</span> {p.name} <b>₹{inr(rateFor(p))}</b>
                </div>
              ))}
            </div>
          )}
        </label>
      </div>

      <div className="card p-0 overflow-auto max-h-[40vh] mb-3">
        <table className="tbl">
          <thead><tr><th>#</th><th>Particulars</th><th>Pack</th><th>Qty</th><th>Rate</th><th>Amount</th><th></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td>{i + 1}</td>
                <td><div>{r.name}</div><div className="text-[11px] font-mono text-slate-400">{r.barcode}</div></td>
                <td><input type="number" value={r.pack} onChange={(e) => patchRow(r.key, 'pack', Number(e.target.value))} className="w-16" /></td>
                <td><input type="number" value={r.qty} onChange={(e) => patchRow(r.key, 'qty', Number(e.target.value))} className="w-20" /></td>
                <td><input type="number" value={r.rate} onChange={(e) => patchRow(r.key, 'rate', Number(e.target.value))} className="w-24" /></td>
                <td className="font-mono">{inr(r.amount)}</td>
                <td><button className="btn-danger" onClick={() => setRows((p) => p.filter((x) => x.key !== r.key))}>✕</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="text-center text-slate-500 py-6">Scan first item to begin…</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm">Items <b>{totals.items}</b> · PackQty <b>{totals.packQty}</b> · Units <b>{totals.units.toFixed(2)}</b> · Sub <b className="font-mono">₹{inr(totals.sub)}</b></div>
        <div className="text-xl font-extrabold ml-auto">Grand Total <span className="font-mono text-emerald-300">₹{inr(totals.sub)}</span></div>
      </div>
      <div className="flex gap-2 mt-3">
        <button className="btn-primary" onClick={() => save(true)}>Save & Print</button>
        <button className="btn-ghost" onClick={() => save(false)}>Save Only</button>
        <button className="btn-danger" onClick={resetForm}>Cancel</button>
      </div>
      {msg && <div className="text-sm text-amber-300 mt-2">{msg}</div>}
    </div>
  );
}
