import { useEffect, useState } from 'react';
import { pos, unwrap } from '../lib/api';

export default function LowStock() {
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      setRows(await unwrap<any[]>(pos().stock.low()));
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const exportXls = async () => {
    try {
      const d: any = await unwrap(pos().excel.dialog('save', [{ name: 'Legacy Excel 97-2004', extensions: ['xls'] }]));
      if (d.canceled) return;
      const r: any = await unwrap(pos().excel.exportLowStock(d.path));
      setMsg(`Exported ${r.count} rows (.xls) → ${r.filePath}`);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div>
      <h1 className="ptitle">Low Stock Register</h1>
      <div className="flex gap-2 mb-3 items-center">
        <span className="text-xs text-slate-400">Available Qty ≤ Minimum Stock · {rows.length} items</span>
        <button className="btn btn-ghost ml-auto" onClick={exportXls}>Export Low Stock (.xls)</button>
      </div>
      {msg && <div className="msg-xs">{msg}</div>}
      <div className="card p-0 overflow-auto max-h-65vh">
        <table className="tbl">
          <thead><tr><th>Product Name</th><th>Barcode</th><th>Alias</th><th>Group</th><th>Available Qty</th><th>Minimum Stock</th><th>Unit</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td>{r.name}</td><td className="mono">{r.barcode}</td><td className="mono">{r.alias}</td>
                <td>{r.group}</td><td className="mono">{r.cloQty}</td><td className="mono">{r.minStock}</td><td>{r.unit}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="text-center text-slate-500 py-6">No low-stock items.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
