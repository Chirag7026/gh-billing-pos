import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pos, unwrap, num } from '../lib/api';

export default function ProductAdd() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', barcode: '', hsnCode: '', gstRate: 0, convFactor: 1, group: '', unit: 'Pcs', mrp: 0, purRate: 0, whRate: 0, rtRate: 0, boxStock: 0, cloQty: 0 });
  const [msg, setMsg] = useState('');
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const r: any = await unwrap(pos().products.nextBarcode());
        setF((p) => (p.barcode ? p : { ...p, barcode: r.next }));
      } catch {}
    })();
  }, []);

  const totalValue = num(f.cloQty) * num(f.purRate);

  const save = async (andNew: boolean) => {
    setMsg('');
    try {
      await unwrap(pos().products.save(f));
      if (andNew) {
        const r: any = await unwrap(pos().products.nextBarcode());
        setF({ name: '', barcode: r.next, hsnCode: '', gstRate: 0, convFactor: 1, group: '', unit: 'Pcs', mrp: 0, purRate: 0, whRate: 0, rtRate: 0, boxStock: 0, cloQty: 0 });
        setMsg(`Saved. Next barcode ${r.next}`);
      } else nav('/products');
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-3">Product Add <span className="kbd ml-2">F5</span></h1>
      <div className="card grid grid-cols-3 gap-3">
        <label className="col-span-2">Name*<input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></label>
        <label>Barcode*<input value={f.barcode} onChange={(e) => set('barcode', e.target.value)} className="font-mono" /></label>
        <label>HSN<input value={f.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} /></label>
        <label>GST %<input type="number" value={f.gstRate} onChange={(e) => set('gstRate', num(e.target.value))} /></label>
        <label>Conv. Factor<input type="number" value={f.convFactor} onChange={(e) => set('convFactor', num(e.target.value, 1))} /></label>
        <label>Group<input value={f.group} onChange={(e) => set('group', e.target.value)} /></label>
        <label>Unit<select value={f.unit} onChange={(e) => set('unit', e.target.value)}>{['Pcs', 'Box', 'Kg', 'Gm', 'Ltr', 'Mtr', 'Pkt'].map((u) => <option key={u}>{u}</option>)}</select></label>
        <label>Opening Stock<input type="number" value={f.cloQty} onChange={(e) => set('cloQty', num(e.target.value))} /></label>
        <label>MRP<input type="number" value={f.mrp} onChange={(e) => set('mrp', num(e.target.value))} /></label>
        <label>Pur Rate<input type="number" value={f.purRate} onChange={(e) => set('purRate', num(e.target.value))} /></label>
        <label>WH Rate<input type="number" value={f.whRate} onChange={(e) => set('whRate', num(e.target.value))} /></label>
        <div className="col-span-3 flex items-center gap-3 bg-slate-800/50 rounded p-2 text-sm">
          <span>Total Value = Opening Stock × Pur Rate</span>
          <b className="text-emerald-300 ml-auto">₹ {totalValue.toFixed(2)}</b>
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
