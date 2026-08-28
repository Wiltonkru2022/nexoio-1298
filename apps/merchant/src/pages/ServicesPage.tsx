import { Button, EmptyState, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { PageHeader } from '../components/PageHeader';
import { StatGrid } from '../components/StatGrid';

export function ServicesPage() {
  return <>
    <PageHeader title="Serviços" description="Monte seu catálogo de serviços com duração, preço e profissionais responsáveis." action={<Button>Novo serviço</Button>} />
    <StatGrid items={[{ label: 'Serviços ativos', value: '0' }, { label: 'Categorias', value: '0' }, { label: 'Mais vendido', value: '—' }, { label: 'Preço médio', value: 'R$ 0,00' }]} />
    <ContentCard title="Catálogo de serviços" description="Serviços disponíveis para venda e agendamento." action={<Pill tone="brand">Catálogo</Pill>}>
      <div className="catalog-grid"><EmptyState title="Nenhum serviço cadastrado" description="Cadastre serviços com preço, duração e equipe habilitada." action={<Button>Novo serviço</Button>} /></div>
    </ContentCard>
  </>;
}
