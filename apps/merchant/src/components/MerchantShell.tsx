import { Brand, Icon } from '@nexoio/ui';
import type { PropsWithChildren } from 'react';
import type { NavigationItem } from '../navigation';
import './merchant-menu.css';

export function MerchantShell({ currentPath, onNavigate, navItems, businessName, onLogout, children }: PropsWithChildren<{ currentPath: string; onNavigate: (path: string) => void; navItems: NavigationItem[]; businessName: string; onLogout:()=>void }>) {
  const groups = [
    { label: 'Principal', items: navItems.filter((item) => item.order < 30) },
    { label: 'Operação', items: navItems.filter((item) => item.order >= 30 && item.order < 60) },
    { label: 'Gestão', items: navItems.filter((item) => item.order >= 60) },
  ].filter((group) => group.items.length);
  const renderItem=(item:NavigationItem)=><button type="button" key={item.path} className={currentPath === item.path ? 'active' : ''} onClick={() => onNavigate(item.path)} aria-current={currentPath===item.path?'page':undefined}><Icon name={item.icon} size={18}/><span>{item.label}</span></button>;
  return <div className="merchant-shell">
    <aside className="merchant-sidebar" aria-label="Menu da empresa">
      <div className="merchant-sidebar-content"><Brand/><p className="workspace-label">Gestão da empresa</p>
        <nav className="merchant-nav" aria-label="Navegação principal">{groups.map((group) => <section className="merchant-nav-group" key={group.label}><p>{group.label}</p>{group.items.map(renderItem)}</section>)}</nav>
      </div>
      <button className="merchant-profile" onClick={onLogout} aria-label={`Sair da conta de ${businessName}`}><div className="avatar">NX</div><div><strong>{businessName}</strong><small>Sair da conta</small></div></button>
    </aside>
    <main className="merchant-main" id="conteudo-principal">{children}</main>
    <nav className="merchant-mobile-nav" aria-label="Navegação no celular">{navItems.slice(0,8).map(renderItem)}</nav>
  </div>;
}
