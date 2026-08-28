import type { AnchorHTMLAttributes, ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { Icon } from './experience';
import './foundations.css';
import './styles.css';
import './patterns.css';
import './experience.css';
import './extras.css';
export * from './experience';
export * from './extras';
export * from './format';

export function Brand() {
  return <a className="brand" href="/"><span>N</span><b>Nexoio</b></a>;
}

export function Button({ children, secondary = false, ghost = false, className: suppliedClassName = '', ...props }: PropsWithChildren<{ secondary?: boolean; ghost?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>>) {
  const className = ghost ? 'btn ghost' : secondary ? 'btn secondary' : 'btn';
  return <button className={`${className} ${suppliedClassName}`.trim()} {...props}>{children}</button>;
}

export function ActionLink({ children, secondary = false, ghost = false, className: suppliedClassName = '', ...props }: PropsWithChildren<{ secondary?: boolean; ghost?: boolean } & AnchorHTMLAttributes<HTMLAnchorElement>>) {
  const className = ghost ? 'btn ghost' : secondary ? 'btn secondary' : 'btn';
  return <a className={`${className} ${suppliedClassName}`.trim()} {...props}>{children}</a>;
}

export function Pill({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' }>) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Metric({ label, value, note, trend }: { label: string; value: string; note?: string; trend?: string }) {
  return <article className="metric"><div className="metric-top"><p>{label}</p>{trend && <span className="trend">{trend}</span>}</div><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

export function SectionTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="section-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon" aria-hidden><Icon name="box" size={28}/></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function Alert({title,description,tone='neutral'}:{title:string;description?:string;tone?:'neutral'|'success'|'warning'|'danger'}){const icon=tone==='success'?'check':tone==='warning'?'warning':tone==='danger'?'error':'info';return <div className={`nx-alert ${tone}`} role={tone==='danger'?'alert':'status'}><Icon name={icon}/><div><strong>{title}</strong>{description?<p>{description}</p>:null}</div></div>}
export function Skeleton({height=18,width='100%'}:{height?:number;width?:string}){return <span className="nx-skeleton" aria-hidden style={{display:'block',height,width}}/>}
export function PageState({kind,title,description,action}:{kind:'empty'|'error'|'offline'|'forbidden'|'incomplete'|'success';title:string;description:string;action?:ReactNode}){const icons={empty:'box',error:'error',offline:'warning',forbidden:'warning',incomplete:'info',success:'check'} as const;return <div className={`nx-page-state ${kind}`} role={kind==='error'?'alert':'status'}><div className="nx-page-state-icon" aria-hidden><Icon name={icons[kind]} size={26}/></div><h3>{title}</h3><p>{description}</p>{action}</div>}
export function Tabs({items,value,onChange}:{items:Array<{value:string;label:string}>;value:string;onChange:(value:string)=>void}){return <div className="nx-tabs" role="tablist">{items.map(item=><button type="button" role="tab" aria-selected={value===item.value} onClick={()=>onChange(item.value)} key={item.value}>{item.label}</button>)}</div>}

export function Shell({ title, subtitle, children, nav, actions }: PropsWithChildren<{ title: string; subtitle?: string; nav?: ReactNode; actions?: ReactNode }>) {
  return <div className="shell"><aside><div><Brand/><p className="workspace-label">Plataforma de gestão</p>{nav}</div><div className="sidebar-footer"><div className="avatar">NX</div><div><strong>Minha empresa</strong><small>Ambiente seguro</small></div></div></aside><main><div className="topbar"><div><p className="eyebrow">NEXOIO</p><h1>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}</div>{actions && <div className="topbar-actions">{actions}</div>}</div>{children}</main></div>;
}
