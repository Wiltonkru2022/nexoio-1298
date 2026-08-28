import type { ReactNode } from 'react';

export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="merchant-page-header"><div><p className="eyebrow">NEXOIO</p><h1>{title}</h1><p>{description}</p></div>{action && <div className="page-actions">{action}</div>}</header>;
}
