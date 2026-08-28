import type { AnchorHTMLAttributes, ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import './styles.css';

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
  return <div className="empty-state"><div className="empty-icon">✦</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function Shell({ title, subtitle, children, nav, actions }: PropsWithChildren<{ title: string; subtitle?: string; nav?: ReactNode; actions?: ReactNode }>) {
  return <div className="shell"><aside><div><Brand/><p className="workspace-label">Plataforma de gestão</p>{nav}</div><div className="sidebar-footer"><div className="avatar">NX</div><div><strong>Minha empresa</strong><small>Ambiente seguro</small></div></div></aside><main><div className="topbar"><div><p className="eyebrow">NEXOIO</p><h1>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}</div>{actions && <div className="topbar-actions">{actions}</div>}</div>{children}</main></div>;
}
