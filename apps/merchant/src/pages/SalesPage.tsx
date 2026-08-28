import { Button, EmptyState, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { PageHeader } from '../components/PageHeader';
import { StatGrid } from '../components/StatGrid';

export function SalesPage() {
  return <>
    <PageHeader title="Vendas" description="Registre vendas, acompanhe pagamentos e consulte o histórico comercial." action={<Button>Nova venda</Button>} />
    <StatGrid items={[{ label: 'Vendas hoje', value: 'R$ 0,00' }, { label: 'Ticket médio', value: 'R$ 0,00' }, { label: 'Pendentes', value: '0' }, { label: 'Canceladas', value: '0' }]} />
    <ContentCard title="Histórico de vendas" description="Todas as vendas ficam organizadas por data, cliente e status." action={<div className="toolbar"><input placeholder="Buscar venda..."/><button>Período</button></div>}>
      <div className="table-shell"><table><thead><tr><th>Venda</th><th>Cliente</th><th>Data</th><th>Total</th><th>Status</th></tr></thead><tbody><tr><td colSpan={5}><EmptyState title="Nenhuma venda registrada" description="As vendas concluídas aparecerão aqui automaticamente." action={<Button>Registrar venda</Button>} /></td></tr></tbody></table></div><div className="card-footer"><Pill tone="neutral">0 vendas</Pill></div>
    </ContentCard>
  </>;
}
