import { Brand } from '@nexoio/ui';
import type { PropsWithChildren } from 'react';
import { NAV_ITEMS } from '../navigation';

export function MerchantShell({ currentPath, onNavigate, children }: PropsWithChildren<{ currentPath: string; onNavigate: (path: string) => void }>) {
  return <div className="merchant-shell">
    <aside className="merchant-sidebar">
      <div><Brand/><p className="workspace-label">Gestão da empresa</p>
        <nav className="merchant-nav">{NAV_ITEMS.map((item) => <button key={item.path} className={currentPath === item.path ? 'active' : ''} onClick={() => onNavigate(item.path)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      </div>
      <div className="merchant-profile"><div className="avatar">NX</div><div><strong>Minha empresa</strong><small>Plano atual</small></div></div>
    </aside>
    <main className="merchant-main">{children}</main>
  </div>;
}
