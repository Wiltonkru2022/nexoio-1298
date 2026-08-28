import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { MerchantShell } from './components/MerchantShell';
import { OverviewPage } from './pages/OverviewPage';
import { CustomersPage } from './pages/CustomersPage';
import { SchedulePage } from './pages/SchedulePage';
import { SalesPage } from './pages/SalesPage';
import { ProductsPage } from './pages/ProductsPage';
import { ServicesPage } from './pages/ServicesPage';
import { CashPage } from './pages/CashPage';
import { FinancePage } from './pages/FinancePage';
import { TeamPage } from './pages/TeamPage';
import { SettingsPage } from './pages/SettingsPage';
import './merchant.css';

const pages: Record<string, ComponentType> = {
  '/': OverviewPage,
  '/clientes': CustomersPage,
  '/agenda': SchedulePage,
  '/vendas': SalesPage,
  '/produtos': ProductsPage,
  '/servicos': ServicesPage,
  '/caixa': CashPage,
  '/financeiro': FinancePage,
  '/equipe': TeamPage,
  '/configuracoes': SettingsPage,
};

export function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (next: string) => {
    if (next === path) return;
    history.pushState({}, '', next);
    setPath(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const Page = pages[path] ?? OverviewPage;
  return <MerchantShell currentPath={pages[path] ? path : '/'} onNavigate={navigate}><Page /></MerchantShell>;
}
