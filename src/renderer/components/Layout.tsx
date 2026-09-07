import { NavLink, useNavigate } from 'react-router-dom';
import { useSyncStatus } from '../hooks/useSyncStatus';

const links: { to: string; label: string; kbd?: string }[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/sales/add', label: 'Sales Add', kbd: 'F1' },
  { to: '/sales', label: 'Sales Display', kbd: 'F2' },
  { to: '/purchase/add', label: 'Purchase Add', kbd: 'F3' },
  { to: '/purchase', label: 'Purchase Display', kbd: 'F4' },
  { to: '/products/add', label: 'Product Add', kbd: 'F5' },
  { to: '/products', label: 'Product Display', kbd: 'F6' },
  { to: '/suppliers/add', label: 'Supplier Add', kbd: 'F7' },
  { to: '/suppliers', label: 'Supplier Display', kbd: 'F8' },
  { to: '/ledgers/sales', label: 'Sales Ledger' },
  { to: '/ledgers/purchase', label: 'Purchase Ledger' },
  { to: '/ledgers/supplier', label: 'Supplier Ledger' },
  { to: '/settings', label: 'Settings' }
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const sync = useSyncStatus(10_000);
  const nav = useNavigate();

  // Global F1..F8 quick launch (spec Page 1)
  useEffectShortcuts(nav);

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
            {sync.ok ? 'Synced' : 'Sync'} · 10s
          </span>
        </div>
        <nav className="flex flex-col gap-0.5 overflow-auto">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `flex items-center justify-between px-2.5 py-1.5 rounded text-sm ${
                  isActive ? 'bg-emerald-700/30 text-emerald-200' : 'text-slate-300 hover:bg-slate-800'
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
      F3: '/purchase/add',
      F4: '/purchase',
      F5: '/products/add',
      F6: '/products',
      F7: '/suppliers/add',
      F8: '/suppliers'
    };
    const onKey = (e: KeyboardEvent) => {
      const dest = map[e.key];
      if (dest) {
        e.preventDefault();
        nav(dest);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);
}
