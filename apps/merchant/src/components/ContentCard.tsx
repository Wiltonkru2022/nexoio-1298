import type { PropsWithChildren, ReactNode } from 'react';
import { Card } from '@nexoio/ui';

export function ContentCard({ title, description, action, children }: PropsWithChildren<{ title: string; description?: string; action?: ReactNode }>) {
  return <Card className="merchant-card"><div className="merchant-card-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</Card>;
}
