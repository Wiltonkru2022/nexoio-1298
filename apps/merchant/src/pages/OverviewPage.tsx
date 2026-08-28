import { Button, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { PageHeader } from '../components/PageHeader';
import { StatGrid } from '../components/StatGrid';

export function OverviewPage() {
  const navigate = (path: string) => { history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };
  return <>
    <PageHeader title="Visão geral" description="Acompanhe o que está acontecendo no seu negócio em um único lugar." action={<Button onClick={() => navigate('/vendas')}>Nova venda</Button>} />
    <StatGrid items={[
      { label: 'Vendas hoje', value: 'R$ 0,00', note: 'Pronto para começar' },
      { label: 'Agenda hoje', value: '0', note: 'Sem conflitos' },
      { label: 'Clientes novos', value: '0', note: 'Este mês' },
      { label: 'Caixa', value: 'Fechado', note: 'Aguardando abertura', tone: 'warning' },
    ]} />
    <div className="merchant-two-columns">
      <ContentCard title="Agenda do dia" description="Próximos atendimentos e compromissos."><div className="merchant-empty"><Pill tone="brand">Hoje</Pill><h3>Nenhum compromisso agendado</h3><p>Quando houver agendamentos, eles aparecerão aqui.</p></div></ContentCard>
      <ContentCard title="Atalhos rápidos" description="Ações usadas com frequência."><div className="quick-actions"><button onClick={() => navigate('/clientes')}>Novo cliente</button><button onClick={() => navigate('/agenda')}>Novo agendamento</button><button onClick={() => navigate('/vendas')}>Registrar venda</button><button onClick={() => navigate('/caixa')}>Abrir caixa</button></div></ContentCard>
    </div>
    <ContentCard title="Atividade recente" description="Últimas movimentações da empresa."><div className="activity-list"><div><span className="activity-dot"/><p><strong>Ambiente preparado</strong><small>A estrutura inicial está pronta para receber dados reais.</small></p><time>Agora</time></div></div></ContentCard>
  </>;
}
