import { Link } from 'react-router-dom';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useSession, canView } from '../hooks/useSession';

const tiles = [
  { to: '/sales/add', key: 'sales-add', t: 'Sales Add', k: 'F1', d: 'Rapid POS · ADD/REMOVE cart' },
  { to: '/sales', key: 'sales-display', t: 'Sales Display', k: 'F2', d: 'Bills, edit in cart, re-print' },
  { to: '/products/add', key: 'product-add', t: 'Product Add', k: 'F3', d: '15-field master' },
  { to: '/products', key: 'product-display', t: 'Product Display', k: 'F4', d: 'Wildcard + inline edit' },
  { to: '/purchase/add', key: 'purchase-add', t: 'Purchase Add', k: 'F5', d: 'Stock in + labels' },
  { to: '/purchase', key: 'purchase-display', t: 'Purchase Display', k: 'F6', d: 'History + edit' },
  { to: '/suppliers/add', key: 'supplier-add', t: 'Account Master Add', k: 'F7', d: 'Ledgers quick-add' },
  { to: '/suppliers', key: 'supplier-display', t: 'Account Master Display', k: 'F8', d: 'Filter + balances' },
  { to: '/stock', key: 'stock-master', t: 'Stock Master', k: '', d: 'Live inventory + total' },
  { to: '/stock/adjust', key: 'stock-adjustment', t: 'Stock Adjustment', k: '', d: 'Audit-tracked corrections' },
  { to: '/stock/low', key: 'low-stock', t: 'Low Stock Register', k: '', d: 'Below minimum + .xls' },
  { to: '/barcode/print', key: 'barcode-print', t: 'Barcode Print', k: '', d: '50×25mm sticker batches' },
  { to: '/ledgers/sales', key: 'sales-ledger', t: 'Sales Ledger', k: '', d: 'Register + .xls' },
  { to: '/ledgers/purchase', key: 'purchase-ledger', t: 'Purchase Ledger', k: '', d: 'Supplier + date filter' },
  { to: '/ledgers/supplier', key: 'supplier-ledger', t: 'Supplier Ledger', k: '', d: 'Statements' },
  { to: '/settings', key: 'settings', t: 'Settings', k: '', d: 'Users, sync, printers, backup' }
];

export default function Dashboard() {
  const sync = useSyncStatus();
  const { session } = useSession();
  const show = tiles.filter((t) => canView(session, t.key) || !session.loggedIn);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="ptitle" style={{ margin: 0 }}>Quick Launch</h1>
        <div className="text-xs text-slate-400" title={sync.message}>
          Live sync: <span className={sync.ok ? 'text-emerald-300' : 'text-amber-300'}>{sync.message}</span>
        </div>
      </div>
      <div className="tiles">
        {show.map((t) => (
          <Link key={t.to} to={t.to} className="card tile">
            <div className="t-head">
              <div className="t-title">{t.t}</div>
              {t.k && <span className="kbd">{t.k}</span>}
            </div>
            <div className="t-desc">{t.d}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
