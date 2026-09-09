import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pos, unwrap } from '../lib/api';

const GROUPS = ['Bank Account', 'Sundry Creditors', 'Sundry Debtors'];

export default function SupplierAdd() {
  const nav = useNavigate();
  const [f, setF] = useState({ accountName: '', group: 'Sundry Creditors', city: '', phone: '', openingBalance: 0, balanceType: 'Dr' });
  const [msg, setMsg] = useState('');
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setMsg('');
    try {
      await unwrap(pos().ledgers.save(f));
      setMsg('Saved.');
      setF({ accountName: '', group: 'Sundry Creditors', city: '', phone: '', openingBalance: 0, balanceType: 'Dr' });
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-3">Supplier / Ledger Add <span className="kbd ml-2">F7</span></h1>
      <div className="card grid grid-cols-2 gap-3">
        <label className="col-span-2">Account Name*<input value={f.accountName} onChange={(e) => set('accountName', e.target.value)} autoFocus /></label>
        <label>Group<select value={f.group} onChange={(e) => set('group', e.target.value)}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></label>
        <label>City<input value={f.city} onChange={(e) => set('city', e.target.value)} /></label>
        <label>Phone<input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <div className="flex gap-2 items-end">
          <label className="flex-1">Opening Balance<input type="number" value={f.openingBalance} onChange={(e) => set('openingBalance', Number(e.target.value))} /></label>
          <select value={f.balanceType} onChange={(e) => set('balanceType', e.target.value)} style={{ width: 76 }} title="Dr/Cr"><option>Dr</option><option>Cr</option></select>
        </div>
        <div className="col-span-2 flex gap-2">
          <button className="btn-primary" onClick={save}>Save</button>
          <button className="btn-ghost" onClick={() => nav('/suppliers')}>Go to Display (F8)</button>
        </div>
        {msg && <div className="col-span-2 text-sm text-amber-300">{msg}</div>}
      </div>
    </div>
  );
}
