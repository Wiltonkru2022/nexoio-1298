import { Brand } from '@nexoio/ui';
import type { PropsWithChildren } from 'react';
import type { NavigationItem } from '../navigation';

export function MerchantShell({ currentPath, onNavigate, navItems, businessName, onLogout, children }: PropsWithChildren<{ currentPath: string; onNavigate: (path: string) => void; navItems: NavigationItem[]; businessName: string; onLogout:()=>void }>) {
  return <div className="merchant-shell">
    <aside className="merchant-sidebar">
      <div><Brand/><p className="workspace-label">Gestão da empresa</p>
        <nav className="merchant-nav">{navItems.map((item) => <button key={item.path} className={currentPath === item.path ? 'active' : ''} onClick={() => onNavigate(item.path)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      </div>
      <button className="merchant-profile" onClick={onLogout}><div className="avatar">NX</div><div><strong>{businessName}</strong><small>Sair da conta</small></div></button>
    </aside>
    <main className="merchant-main">{children}</main>
  </div>;
}
