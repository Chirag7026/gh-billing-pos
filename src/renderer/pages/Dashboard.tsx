import { Link } from 'react-router-dom';
import { useSyncStatus } from '../hooks/useSyncStatus';

const tiles = [
  { to: '/sales/add', t: 'Sales Add', k: 'F1', d: 'Rapid POS checkout' },
  { to: '/sales', t: 'Sales Display', k: 'F2', d: 'Bills, re-print, edit' },
  { to: '/purchase/add', t: 'Purchase Add', k: 'F3', d: 'Stock in + labels' },
  { to: '/purchase', t: 'Purchase Display', k: 'F4', d: 'Purchase history' },
  { to: '/products/add', t: 'Product Add', k: 'F5', d: 'Auto-barcode sequencer' },
  { to: '/products', t: 'Product Display', k: 'F6', d: 'Search + inline edit' },
  { to: '/suppliers/add', t: 'Supplier Add', k: 'F7', d: 'Ledgers quick-add' },
  { to: '/suppliers', t: 'Supplier Display', k: 'F8', d: 'Filter + balances' },
  { to: '/ledgers/sales', t: 'Sales Ledger', k: '', d: 'Register + Excel' },
  { to: '/ledgers/purchase', t: 'Purchase Ledger', k: '', d: 'Supplier + date filter' },
  { to: '/ledgers/supplier', t: 'Supplier Ledger', k: '', d: 'Statements' },
  { to: '/settings', t: 'Settings', k: '', d: 'DB, sync, printers' }
];

export default function Dashboard() {
  const sync = useSyncStatus();
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Quick Launch</h1>
        <div className="text-xs text-slate-400" title={sync.message}>
          Live sync: <span className={sync.ok ? 'text-emerald-300' : 'text-amber-300'}>{sync.message}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="card hover:border-emerald-600 transition">
            <div className="flex items-center justify-between">
              <div className="font-bold">{t.t}</div>
              {t.k && <span className="kbd">{t.k}</span>}
            </div>
            <div className="text-xs text-slate-400 mt-1">{t.d}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
