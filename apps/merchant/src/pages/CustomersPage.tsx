import { Button, EmptyState, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { PageHeader } from '../components/PageHeader';
import { StatGrid } from '../components/StatGrid';

export function CustomersPage() {
  return <>
    <PageHeader title="Clientes" description="Cadastre, pesquise e acompanhe o histórico de relacionamento com seus clientes." action={<Button>Novo cliente</Button>} />
    <StatGrid items={[{ label: 'Clientes ativos', value: '0' }, { label: 'Novos no mês', value: '0' }, { label: 'Retenção', value: '—' }, { label: 'Aniversariantes', value: '0' }]} />
    <ContentCard title="Base de clientes" description="Encontre clientes por nome, CPF, telefone ou e-mail." action={<div className="toolbar"><input placeholder="Buscar cliente..."/><button>Filtros</button></div>}>
      <div className="table-shell"><table><thead><tr><th>Cliente</th><th>Contato</th><th>Última visita</th><th>Status</th><th></th></tr></thead><tbody><tr><td colSpan={5}><EmptyState title="Nenhum cliente cadastrado" description="Crie o primeiro cliente para começar a construir sua base." action={<Button>Novo cliente</Button>} /></td></tr></tbody></table></div>
      <div className="card-footer"><Pill tone="neutral">0 clientes</Pill></div>
    </ContentCard>
  </>;
}
