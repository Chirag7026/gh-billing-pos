import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pos, unwrap, num } from '../lib/api';
import { prefs } from '../lib/prefs';

// V2 strict 15-field sequence:
// name, alias, barcode, group, hsnCode, gstRate, gstType, minStock,
// convFactor, openingStock, purRate, whRate, rtRate, mrp, unit
const BLANK = {
  name: '', alias: '', barcode: '', group: 'GENERAL', hsnCode: '', gstRate: 0,
  gstType: 'GST On Rate', minStock: 1, convFactor: 1, openingStock: 0,
  purRate: 0, whRate: 0, rtRate: 0, mrp: 0, unit: 'Pcs', boxStock: 0, cloQty: 0
};

export default function ProductAdd() {
  const nav = useNavigate();
  const [f, setF] = useState({ ...BLANK });
  const [msg, setMsg] = useState('');
  const [groups, setGroups] = useState<string[]>(['GENERAL']);
  const [units, setUnits] = useState<string[]>(['Pcs', 'Box', 'Kg', 'Pack']);
  const [rates, setRates] = useState<number[]>([0, 5, 12, 18, 28]);
  const aliasTouched = useRef(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  // Alias auto-populates from barcode until the user edits it manually.
  const setBarcode = (v: string) => {
    setF((p) => ({ ...p, barcode: v, alias: aliasTouched.current ? p.alias : v }));
  };

  const fresh = async () => {
    try {
      const r: any = await unwrap(pos().products.nextBarcode());
      const p = await prefs().catch(() => ({}));
      setF((prev) => ({
        ...prev,
        barcode: prev.barcode || r.next,
        minStock: p.minStockDefault === 'convFactor' ? num(prev.convFactor, 1) : prev.minStock || 1
      }));
    } catch {}
  };

  useEffect(() => {
    fresh();
    (async () => {
      try {
        const [g, u, r] = await Promise.all([
          unwrap<any[]>(pos().masters.list('group')).catch(() => []),
          unwrap<any[]>(pos().masters.list('unit')).catch(() => []),
          unwrap<any[]>(pos().masters.list('gstRate')).catch(() => [])
        ]);
        if (g.length) setGroups(g.map((x: any) => x.name));
        if (u.length) setUnits(u.map((x: any) => x.name));
        if (r.length) setRates(r.map((x: any) => Number(x.value)));
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cf = num(f.convFactor, 1) || 1;
  const totalQty = cf * num(f.openingStock);
  const totalAmount = totalQty * num(f.purRate);

  const save = async (andBarcode: boolean) => {
    setMsg('');
    try {
      await unwrap(pos().products.save(f));
      if (andBarcode) {
        // Save & Barcode: open Barcode Print pre-populated, qty = opening stock.
        nav(`/barcode/print?barcode=${encodeURIComponent(f.barcode)}&copies=${Math.max(1, Math.round(num(f.openingStock)))}`);
      } else nav('/products');
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="ptitle">Product Add <span className="kbd ml-2">F3</span></h1>
      <div className="card grid grid-cols-3 gap-3">
        <label className="lbl">1 · Name*<input type="text" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></label>
        <label className="lbl">2 · Alias<input type="text" value={f.alias} onChange={(e) => { aliasTouched.current = true; set('alias', e.target.value); }} placeholder="defaults to barcode" /></label>
        <label className="lbl">3 · Barcode*<input type="text" value={f.barcode} onChange={(e) => setBarcode(e.target.value)} className="mono" /></label>
        <label className="lbl">4 · Group<input type="text" value={f.group} list="pa-groups" onChange={(e) => set('group', e.target.value)} /></label>
        <label className="lbl">5 · HSN<input type="text" value={f.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} /></label>
        <label className="lbl">6 · GST %<select value={f.gstRate} onChange={(e) => set('gstRate', Number(e.target.value))}>{rates.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        <label className="lbl">7 · GST Type<select value={f.gstType} onChange={(e) => set('gstType', e.target.value)}><option>GST On Rate</option><option>GST Included</option></select></label>
        <label className="lbl">8 · Min Stock<input type="number" value={f.minStock} onChange={(e) => set('minStock', num(e.target.value))} /></label>
        <label className="lbl">9 · Conv. Factor<input type="number" value={f.convFactor} onChange={(e) => set('convFactor', num(e.target.value, 1))} /></label>
        <label className="lbl">10 · Opening Stock<input type="number" value={f.openingStock} onChange={(e) => set('openingStock', num(e.target.value))} /></label>
        <label className="lbl">11 · Pur Rate<input type="number" value={f.purRate} onChange={(e) => set('purRate', num(e.target.value))} /></label>
        <label className="lbl">12 · WH Rate<input type="number" value={f.whRate} onChange={(e) => set('whRate', num(e.target.value))} /></label>
        <label className="lbl">13 · Rt Rate<input type="number" value={f.rtRate} onChange={(e) => set('rtRate', num(e.target.value))} /></label>
        <label className="lbl">14 · MRP<input type="number" value={f.mrp} onChange={(e) => set('mrp', num(e.target.value))} /></label>
        <label className="lbl">15 · Unit<input type="text" value={f.unit} list="pa-units" onChange={(e) => set('unit', e.target.value)} /></label>
        <datalist id="pa-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        <datalist id="pa-units">{units.map((u) => <option key={u} value={u} />)}</datalist>
        <div className="col-span-3 grid grid-cols-2 gap-3 strip">
          <div>Total Qty = Conv × Opening<b className="ml-2 text-emerald-300" id="t-qty">{totalQty.toFixed(2)}</b></div>
          <div>Total Amount = Qty × Pur Rate<b className="ml-2 text-emerald-300" id="t-amt">₹ {totalAmount.toFixed(2)}</b></div>
        </div>
        <div className="col-span-3 flex gap-2">
          <button className="btn btn-primary" onClick={() => save(true)}>Save & Barcode</button>
          <button className="btn btn-ghost" onClick={() => save(false)}>Save → Display</button>
        </div>
        {msg && <div className="col-span-3 msg">{msg}</div>}
      </div>
    </div>
  );
}
