import { Button, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { PageHeader } from '../components/PageHeader';
import { StatGrid } from '../components/StatGrid';

export function CashPage() {
  return <>
    <PageHeader title="Caixa" description="Abra, acompanhe e feche o caixa com movimentações organizadas e auditáveis." action={<Button>Abrir caixa</Button>} />
    <StatGrid items={[{ label: 'Status', value: 'Fechado', note: 'Nenhuma sessão ativa', tone: 'warning' }, { label: 'Saldo inicial', value: 'R$ 0,00' }, { label: 'Entradas', value: 'R$ 0,00' }, { label: 'Saídas', value: 'R$ 0,00' }]} />
    <div className="merchant-two-columns">
      <ContentCard title="Sessão atual" description="Resumo do caixa em operação."><div className="merchant-empty"><Pill tone="warning">Caixa fechado</Pill><h3>Abra o caixa para começar</h3><p>Ao abrir, entradas, saídas e vendas em dinheiro serão acompanhadas aqui.</p><Button>Abrir caixa</Button></div></ContentCard>
      <ContentCard title="Conferência" description="Valores por forma de pagamento."><div className="money-list"><div><span>Dinheiro</span><strong>R$ 0,00</strong></div><div><span>Pix</span><strong>R$ 0,00</strong></div><div><span>Cartão</span><strong>R$ 0,00</strong></div></div></ContentCard>
    </div>
  </>;
}
