import { Brand, Icon } from '@nexoio/ui';
import { useState, type PropsWithChildren } from 'react';
import type { NavigationItem } from '../navigation';
import './merchant-menu.css';

export function MerchantShell({ currentPath, onNavigate, navItems, businessName, onLogout, children }: PropsWithChildren<{ currentPath: string; onNavigate: (path: string) => void; navItems: NavigationItem[]; businessName: string; onLogout:()=>void }>) {
  const[mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const groups = [
    { label: 'Principal', items: navItems.filter((item) => item.order < 30) },
    { label: 'Operação', items: navItems.filter((item) => item.order >= 30 && item.order < 60) },
    { label: 'Gestão', items: navItems.filter((item) => item.order >= 60) },
  ].filter((group) => group.items.length);
  const navigate=(path:string)=>{setMobileMenuOpen(false);onNavigate(path)};
  const renderItem=(item:NavigationItem)=><button type="button" key={item.path} className={currentPath === item.path ? 'active' : ''} onClick={() => navigate(item.path)} aria-current={currentPath===item.path?'page':undefined}><Icon name={item.icon} size={18}/><span>{item.label}</span></button>;
  return <div className="merchant-shell">
    {mobileMenuOpen?<button type="button" className="merchant-mobile-overlay" aria-label="Fechar menu" onClick={()=>setMobileMenuOpen(false)}/>:null}
    <aside className={`merchant-sidebar ${mobileMenuOpen?'mobile-open':''}`} aria-label="Menu da empresa">
      <div className="merchant-sidebar-content"><div className="merchant-sidebar-head"><Brand/><button type="button" className="merchant-mobile-close" aria-label="Fechar menu" onClick={()=>setMobileMenuOpen(false)}>×</button></div><p className="workspace-label">Gestão da empresa</p>
        <nav className="merchant-nav" aria-label="Navegação principal">{groups.map((group) => <section className="merchant-nav-group" key={group.label}><p>{group.label}</p>{group.items.map(renderItem)}</section>)}</nav>
      </div>
      <button className="merchant-profile" onClick={onLogout} aria-label={`Sair da conta de ${businessName}`}><div className="avatar">NX</div><div><strong>{businessName}</strong><small>Sair da conta</small></div></button>
    </aside>
    <main className="merchant-main" id="conteudo-principal"><div className="merchant-mobile-header"><button type="button" className="merchant-mobile-toggle" aria-label="Abrir menu" aria-expanded={mobileMenuOpen} onClick={()=>setMobileMenuOpen(true)}>☰</button><Brand/></div>{children}</main>
    <nav className="merchant-mobile-nav" aria-label="Navegação rápida no celular">{navItems.slice(0,8).map(renderItem)}</nav>
  </div>;
}
