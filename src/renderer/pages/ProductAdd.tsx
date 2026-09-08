import { useEffect, useState } from 'react';
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
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cf = num(f.convFactor, 1) || 1;
  const totalQty = cf * num(f.openingStock);
  const totalAmount = totalQty * num(f.purRate);

  const save = async (andNew: boolean) => {
    setMsg('');
    try {
      await unwrap(pos().products.save(f));
      if (andNew) {
        const r: any = await unwrap(pos().products.nextBarcode());
        setF({ ...BLANK, barcode: r.next });
        setMsg(`Saved. Next barcode ${r.next}`);
      } else nav('/products');
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-3">Product Add <span className="kbd ml-2">F3</span></h1>
      <div className="card grid grid-cols-3 gap-3">
        <label>1 · Name*<input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></label>
        <label>2 · Alias<input value={f.alias} onChange={(e) => set('alias', e.target.value)} placeholder="defaults to barcode" /></label>
        <label>3 · Barcode*<input value={f.barcode} onChange={(e) => set('barcode', e.target.value)} className="font-mono" /></label>
        <label>4 · Group<input value={f.group} onChange={(e) => set('group', e.target.value)} /></label>
        <label>5 · HSN<input value={f.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} /></label>
        <label>6 · GST %<select value={f.gstRate} onChange={(e) => set('gstRate', Number(e.target.value))}>{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        <label>7 · GST Type<select value={f.gstType} onChange={(e) => set('gstType', e.target.value)}><option>GST On Rate</option><option>GST Included</option></select></label>
        <label>8 · Min Stock<input type="number" value={f.minStock} onChange={(e) => set('minStock', num(e.target.value))} /></label>
        <label>9 · Conv. Factor<input type="number" value={f.convFactor} onChange={(e) => set('convFactor', num(e.target.value, 1))} /></label>
        <label>10 · Opening Stock<input type="number" value={f.openingStock} onChange={(e) => set('openingStock', num(e.target.value))} /></label>
        <label>11 · Pur Rate<input type="number" value={f.purRate} onChange={(e) => set('purRate', num(e.target.value))} /></label>
        <label>12 · WH Rate<input type="number" value={f.whRate} onChange={(e) => set('whRate', num(e.target.value))} /></label>
        <label>13 · Rt Rate<input type="number" value={f.rtRate} onChange={(e) => set('rtRate', num(e.target.value))} /></label>
        <label>14 · MRP<input type="number" value={f.mrp} onChange={(e) => set('mrp', num(e.target.value))} /></label>
        <label>15 · Unit<select value={f.unit} onChange={(e) => set('unit', e.target.value)}>{['Pcs', 'Box', 'Kg', 'Pack'].map((u) => <option key={u}>{u}</option>)}</select></label>
        <div className="col-span-3 grid grid-cols-2 gap-3 bg-slate-800/50 rounded p-2 text-sm">
          <span>Total Qty = Conv × Opening <b className="text-emerald-300 ml-2">{totalQty.toFixed(2)}</b></span>
          <span>Total Amount = Qty × Pur Rate <b className="text-emerald-300 ml-2">₹ {totalAmount.toFixed(2)}</b></span>
        </div>
        <div className="col-span-3 flex gap-2">
          <button className="btn-primary" onClick={() => save(true)}>Save & New</button>
          <button className="btn-ghost" onClick={() => save(false)}>Save → Display</button>
        </div>
        {msg && <div className="col-span-3 text-sm text-amber-300">{msg}</div>}
      </div>
    </div>
  );
}
