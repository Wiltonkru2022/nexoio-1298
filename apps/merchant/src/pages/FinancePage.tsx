import { Button, EmptyState } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { PageHeader } from '../components/PageHeader';
import { StatGrid } from '../components/StatGrid';

export function FinancePage() {
  return <>
    <PageHeader title="Financeiro" description="Acompanhe receitas, despesas, contas e resultado financeiro da empresa." action={<Button>Nova movimentação</Button>} />
    <StatGrid items={[{ label: 'Receitas do mês', value: 'R$ 0,00' }, { label: 'Despesas do mês', value: 'R$ 0,00' }, { label: 'Resultado', value: 'R$ 0,00' }, { label: 'A vencer', value: 'R$ 0,00' }]} />
    <div className="merchant-two-columns">
      <ContentCard title="Fluxo financeiro" description="Comparativo de entradas e saídas."><div className="mini-chart"><span style={{height:'28%'}}/><span style={{height:'46%'}}/><span style={{height:'36%'}}/><span style={{height:'62%'}}/><span style={{height:'51%'}}/><span style={{height:'78%'}}/><span style={{height:'66%'}}/></div></ContentCard>
      <ContentCard title="Contas próximas" description="Pagamentos e recebimentos previstos."><EmptyState title="Nada vencendo agora" description="Contas a pagar e receber aparecerão aqui." /></ContentCard>
    </div>
  </>;
}
