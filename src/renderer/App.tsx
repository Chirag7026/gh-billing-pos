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
import SalesLedger from './pages/SalesLedger';
import PurchaseLedger from './pages/PurchaseLedger';
import SupplierLedger from './pages/SupplierLedger';
import LoginSetup from './pages/LoginSetup';
import Settings from './pages/Settings';
import EnterAsTab from './hooks/useEnterAsTab';
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

export default function App() {
  return (
    <HashRouter>
      <EnterAsTab />
      <TitleBar />
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
          <Route path="/ledgers/sales" element={<SalesLedger />} />
          <Route path="/ledgers/purchase" element={<PurchaseLedger />} />
          <Route path="/ledgers/supplier" element={<SupplierLedger />} />
          <Route path="/settings" element={<Settings />} />
        </Routes></Layout></Guard>} />
      </Routes>
    </HashRouter>
  );
}
