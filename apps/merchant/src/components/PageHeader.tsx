import type { ReactNode } from 'react';
import { PageHeader as NexoioPageHeader } from '@nexoio/ui';

export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <NexoioPageHeader eyebrow="Nexoio" title={title} description={description} actions={action}/>;
}
