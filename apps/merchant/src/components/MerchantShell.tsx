import { Brand } from '@nexoio/ui';
import type { PropsWithChildren } from 'react';
import type { NavigationItem } from '../navigation';
import './merchant-menu.css';

export function MerchantShell({ currentPath, onNavigate, navItems, businessName, onLogout, children }: PropsWithChildren<{ currentPath: string; onNavigate: (path: string) => void; navItems: NavigationItem[]; businessName: string; onLogout:()=>void }>) {
  const groups = [
    { label: 'Principal', items: navItems.filter((item) => item.order < 30) },
    { label: 'Operação', items: navItems.filter((item) => item.order >= 30 && item.order < 60) },
    { label: 'Gestão', items: navItems.filter((item) => item.order >= 60) },
  ].filter((group) => group.items.length);
  return <div className="merchant-shell">
    <aside className="merchant-sidebar">
      <div className="merchant-sidebar-content"><Brand/><p className="workspace-label">Gestão da empresa</p>
        <nav className="merchant-nav" aria-label="Navegação principal">{groups.map((group) => <section className="merchant-nav-group" key={group.label}><p>{group.label}</p>{group.items.map((item) => <button type="button" key={item.path} className={currentPath === item.path ? 'active' : ''} onClick={() => onNavigate(item.path)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</section>)}</nav>
      </div>
      <button className="merchant-profile" onClick={onLogout}><div className="avatar">NX</div><div><strong>{businessName}</strong><small>Sair da conta</small></div></button>
    </aside>
    <main className="merchant-main">{children}</main>
  </div>;
}
