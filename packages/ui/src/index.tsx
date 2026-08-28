import type { PropsWithChildren, ReactNode } from 'react';
import './styles.css';
export function Brand() { return <a className="brand" href="/"><span>N</span>Nexoio</a>; }
export function Shell({ title, subtitle, children, nav }: PropsWithChildren<{ title: string; subtitle?: string; nav?: ReactNode }>) { return <div className="shell"><aside><Brand/>{nav}</aside><main><header><p className="eyebrow">NEXOIO</p><h1>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}</header>{children}</main></div>; }
export function Metric({ label, value, note }: { label: string; value: string; note?: string }) { return <article className="metric"><p>{label}</p><strong>{value}</strong>{note && <small>{note}</small>}</article>; }
export function Button({ children, secondary=false }: PropsWithChildren<{secondary?:boolean}>) { return <button className={secondary?'secondary':''}>{children}</button>; }
