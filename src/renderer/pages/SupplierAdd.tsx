import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pos, unwrap } from '../lib/api';

const GROUPS = ['Bank Account', 'Sundry Creditors', 'Sundry Debtors'];

export default function SupplierAdd() {
  const nav = useNavigate();
  const [f, setF] = useState({ accountName: '', group: 'Sundry Creditors', city: '', phone: '', gstin: '', openingBalance: 0, balanceType: 'Dr' });
  const [msg, setMsg] = useState('');
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setMsg('');
    try {
      await unwrap(pos().ledgers.save(f));
      setMsg('Saved.');
      setF({ accountName: '', group: 'Sundry Creditors', city: '', phone: '', gstin: '', openingBalance: 0, balanceType: 'Dr' });
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="ptitle">Account Master Add <span className="kbd ml-2">F7</span></h1>
      <div className="card grid grid-cols-2 gap-3">
        <label className="lbl col-span-2">Account Name*<input type="text" value={f.accountName} onChange={(e) => set('accountName', e.target.value)} autoFocus /></label>
        <label className="lbl">Group<select value={f.group} onChange={(e) => set('group', e.target.value)}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></label>
        <label className="lbl">City<input type="text" value={f.city} onChange={(e) => set('city', e.target.value)} /></label>
        <label className="lbl">Phone<input type="text" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label className="lbl">GSTIN (15 chars)<input type="text" value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))} className="font-mono" placeholder="e.g. 08ABCDE1234F1Z5" /></label>
        <div className="flex gap-2 items-end">
          <label className="lbl flex-1">Opening Balance<input type="number" value={f.openingBalance} onChange={(e) => set('openingBalance', Number(e.target.value))} /></label>
          <select value={f.balanceType} onChange={(e) => set('balanceType', e.target.value)} style={{ width: 76 }} title="Dr/Cr"><option>Dr</option><option>Cr</option></select>
        </div>
        <div className="col-span-2 flex gap-2">
          <button className="btn btn-primary" onClick={save}>Save</button>
          <button className="btn btn-ghost" onClick={() => nav('/suppliers')}>Go to Display (F8)</button>
        </div>
        {msg && <div className="col-span-2 msg">{msg}</div>}
      </div>
    </div>
  );
}
