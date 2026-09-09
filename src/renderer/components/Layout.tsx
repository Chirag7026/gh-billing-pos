import { NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useSession, canView } from '../hooks/useSession';

const links: { to: string; key: string; label: string; kbd?: string }[] = [
  { to: '/', key: 'dashboard', label: 'Dashboard' },
  { to: '/sales/add', key: 'sales-add', label: 'Sales Add', kbd: 'F1' },
  { to: '/sales', key: 'sales-display', label: 'Sales Display', kbd: 'F2' },
  { to: '/products/add', key: 'product-add', label: 'Product Add', kbd: 'F3' },
  { to: '/products', key: 'product-display', label: 'Product Display', kbd: 'F4' },
  { to: '/purchase/add', key: 'purchase-add', label: 'Purchase Add', kbd: 'F5' },
  { to: '/purchase', key: 'purchase-display', label: 'Purchase Display', kbd: 'F6' },
  { to: '/suppliers/add', key: 'supplier-add', label: 'Supplier Add', kbd: 'F7' },
  { to: '/suppliers', key: 'supplier-display', label: 'Supplier Display', kbd: 'F8' },
  { to: '/stock', key: 'stock-master', label: 'Stock Master' },
  { to: '/stock/adjust', key: 'stock-adjustment', label: 'Stock Adjustment' },
  { to: '/stock/low', key: 'low-stock', label: 'Low Stock' },
  { to: '/barcode/print', key: 'barcode-print', label: 'Barcode Print' },
  { to: '/ledgers/sales', key: 'sales-ledger', label: 'Sales Ledger' },
  { to: '/ledgers/purchase', key: 'purchase-ledger', label: 'Purchase Ledger' },
  { to: '/ledgers/supplier', key: 'supplier-ledger', label: 'Supplier Ledger' },
  { to: '/settings', key: 'settings', label: 'Settings' }
];

export function pathKey(pathname: string): string {
  const hit = links.find((l) => l.to === pathname);
  return hit ? hit.key : 'dashboard';
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const sync = useSyncStatus();
  const nav = useNavigate();
  const loc = useLocation();
  const { session } = useSession();

  // Global F1..F8 quick launch (V2 map)
  useEffectShortcuts(nav);

  const visible = links.filter((l) => canView(session, l.key) || !session.loggedIn);
  // Route-level RBAC: bounce unauthorized deep links to dashboard.
  if (session.loggedIn && !canView(session, pathKey(loc.pathname))) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex pt-8">
      <aside className="w-56 shrink-0 bg-slate-900 border-r border-slate-800 p-3 flex flex-col gap-1 no-print">
        <div className="px-2 py-2">
          <div className="text-lg font-extrabold tracking-wide">G H</div>
          <div className="text-[11px] text-slate-400">Golden Heera POS</div>
        </div>
        <div className="mb-2 px-2">
          <span
            title={sync.message}
            className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border ${
              sync.ok ? 'border-emerald-700 text-emerald-300' : 'border-amber-700 text-amber-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${sync.ok ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
            {sync.ok ? 'Synced' : 'Sync'} · {Math.round(((sync as any).intervalMs || 10000) / 1000)}s
          </span>
        </div>
        <nav className="flex flex-col gap-0.5 overflow-auto">
          {visible.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end
              className={({ isActive }) =>
                `flex items-center justify-between px-2.5 py-1.5 rounded text-sm ${
                  isActive ? 'bg-emerald-800 text-emerald-100' : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <span>{l.label}</span>
              {l.kbd && <span className="kbd">{l.kbd}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto text-[11px] text-slate-500 px-2">Scanner: wedge-ready · 80mm ESC/POS</div>
      </aside>
      <main className="flex-1 p-4 max-w-[1200px]">{children}</main>
    </div>
  );
}

import { useEffect } from 'react';
function useEffectShortcuts(nav: ReturnType<typeof useNavigate>) {
  useEffect(() => {
    const map: Record<string, string> = {
      F1: '/sales/add',
      F2: '/sales',
      F3: '/products/add',
      F4: '/products',
      F5: '/purchase/add',
      F6: '/purchase',
      F7: '/suppliers/add',
      F8: '/suppliers'
    };
    const onKey = (e: KeyboardEvent) => {
      const dest = map[e.key];
      if (!dest) return;
      const tag = ((e.target as HTMLElement)?.tagName || '').toUpperCase();
      if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(tag)) return;
      e.preventDefault();
      nav(dest);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);
}
