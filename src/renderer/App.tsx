import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SupplierAdd from './pages/SupplierAdd';
import SupplierDisplay from './pages/SupplierDisplay';
import ProductAdd from './pages/ProductAdd';
import ProductDisplay from './pages/ProductDisplay';
import SaleAdd from './pages/SaleAdd';
import SaleDisplay from './pages/SaleDisplay';
import PurchaseAdd from './pages/PurchaseAdd';
import PurchaseDisplay from './pages/PurchaseDisplay';
import StockMaster from './pages/StockMaster';
import StockAdjustmentPage from './pages/StockAdjustment';
import LowStock from './pages/LowStock';
import BarcodePrint from './pages/BarcodePrint';
import SalesLedger from './pages/SalesLedger';
import PurchaseLedger from './pages/PurchaseLedger';
import SupplierLedger from './pages/SupplierLedger';
import LoginSetup from './pages/LoginSetup';
import Settings from './pages/Settings';
import EnterAsTab from './hooks/useEnterAsTab';
import AllCaps from './hooks/useAllCaps';
import TitleBar from './components/TitleBar';
import { pos, unwrap } from './lib/api';

function Guard({ children }: { children: JSX.Element }) {
  const [state, setState] = useState<'loading' | 'ok' | 'login'>('loading');
  const nav = useNavigate();
  useEffect(() => {
    (async () => {
      try {
        const s: any = await unwrap(pos().auth.session());
        if (s.loggedIn) setState('ok');
        else {
          setState('login');
          nav('/login');
        }
      } catch {
        setState('ok'); // browser dev without bridge — still show UI
      }
    })();
  }, [nav]);
  if (state === 'loading') return <div className="p-8 text-slate-400">Loading…</div>;
  if (state === 'login') return <Navigate to="/login" replace />;
  return children;
}

/**
 * Startup integrity gate: if the local data files are missing/corrupt,
 * offer one-click auto-restore from the latest valid snapshot (any dest).
 */
function IntegrityGate() {
  const [bad, setBad] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const r: any = await unwrap(pos().backup.integrity());
        if (!r.ok) setBad(r);
      } catch {}
    })();
  }, []);
  if (!bad) return null;
  const snap = bad.snapshot;
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <h2 className="font-bold text-lg text-red-300">Database integrity check failed</h2>
        <p className="text-sm text-slate-300 mt-2">{bad.error}</p>
        {snap ? (
          <p className="text-sm text-slate-400 mt-2">
            Latest valid snapshot: <span className="font-mono">{snap.name}</span> (dest {snap.dest}).
          </p>
        ) : (
          <p className="text-sm text-slate-400 mt-2">No valid snapshot found in any backup destination.</p>
        )}
        <div className="flex gap-2 mt-4">
          {snap && (
            <button
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await unwrap(pos().sync.pause());
                  try {
                    await unwrap(pos().backup.restore(snap.path));
                  } finally {
                    await unwrap(pos().sync.resume()).catch(() => undefined);
                  }
                  window.location.reload();
                } catch (e: any) {
                  alert(`Auto-restore failed: ${e.message}`);
                  setBusy(false);
                }
              }}
            >
              Auto-restore & Reload
            </button>
          )}
          <button className="btn-ghost" onClick={() => setBad(null)}>
            Continue Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <EnterAsTab />
      <AllCaps />
      <TitleBar />
      <IntegrityGate />
      <Routes>
        <Route path="/login" element={<LoginSetup />} />
        <Route path="/*" element={<Guard><Layout><Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/suppliers/add" element={<SupplierAdd />} />
          <Route path="/suppliers" element={<SupplierDisplay />} />
          <Route path="/products/add" element={<ProductAdd />} />
          <Route path="/products" element={<ProductDisplay />} />
          <Route path="/sales/add" element={<SaleAdd />} />
          <Route path="/sales" element={<SaleDisplay />} />
          <Route path="/purchase/add" element={<PurchaseAdd />} />
          <Route path="/purchase" element={<PurchaseDisplay />} />
          <Route path="/stock" element={<StockMaster />} />
          <Route path="/stock/adjust" element={<StockAdjustmentPage />} />
          <Route path="/stock/low" element={<LowStock />} />
          <Route path="/barcode/print" element={<BarcodePrint />} />
          <Route path="/ledgers/sales" element={<SalesLedger />} />
          <Route path="/ledgers/purchase" element={<PurchaseLedger />} />
          <Route path="/ledgers/supplier" element={<SupplierLedger />} />
          <Route path="/settings" element={<Settings />} />
        </Routes></Layout></Guard>} />
      </Routes>
    </HashRouter>
  );
}
