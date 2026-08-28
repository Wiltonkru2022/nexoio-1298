import type { PropsWithChildren, ReactNode } from 'react';

export function ContentCard({ title, description, action, children }: PropsWithChildren<{ title: string; description?: string; action?: ReactNode }>) {
  return <section className="merchant-card"><div className="merchant-card-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}
