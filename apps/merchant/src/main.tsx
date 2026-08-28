import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Metric, Pill, SectionTitle, Shell } from '@nexoio/ui';

const Nav = () => <nav className="nav"><a className="active">Visão geral</a><a>Clientes</a><a>Agenda</a><a>Vendas</a><a>Produtos</a><a>Serviços</a><a>Caixa</a><a>Financeiro</a><a>Equipe</a><a>Configurações</a></nav>;

function App() {
  return <Shell title="Bom dia, empreendedor." subtitle="Acompanhe o movimento da empresa e acesse o que precisa sem perder tempo." nav={<Nav />} actions={<><Button ghost>Ver site</Button><Button>Nova venda</Button></>}>
    <section className="grid">
      <Metric label="Vendas hoje" value="R$ 0,00" trend="0%" note="Nenhuma venda registrada ainda" />
      <Metric label="Agenda de hoje" value="0" note="Nenhum compromisso pendente" />
      <Metric label="Clientes novos" value="0" note="Neste mês" />
      <Metric label="Caixa" value="Fechado" note="Abra o caixa para começar" />
    </section>

    <section className="dashboard-columns">
      <div className="panel">
        <SectionTitle eyebrow="MOVIMENTO" title="Visão dos últimos 7 dias" description="Acompanhe rapidamente a evolução das vendas." action={<Pill tone="brand">Esta semana</Pill>} />
        <div className="chart">{[24,42,30,58,46,72,54].map((h, i) => <div key={i} className="bar" style={{height: `${h}%`}} />)}</div>
        <div className="bar-labels"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div>
      </div>
      <div className="panel">
        <SectionTitle eyebrow="HOJE" title="Agenda" description="Próximos compromissos da equipe." />
        <div className="empty-state"><div className="empty-icon">✦</div><h3>Agenda livre</h3><p>Quando houver agendamentos, eles aparecerão aqui em ordem de horário.</p><Button secondary>Novo agendamento</Button></div>
      </div>
    </section>

    <section className="panel">
      <SectionTitle eyebrow="ATALHOS" title="Ações rápidas" description="Comece pelas tarefas mais usadas no dia a dia." />
      <div className="quick-grid">
        <div className="quick-action"><strong>Novo cliente</strong><span>Cadastre contato e dados básicos.</span></div>
        <div className="quick-action"><strong>Nova venda</strong><span>Registre produtos, serviços e pagamentos.</span></div>
        <div className="quick-action"><strong>Novo agendamento</strong><span>Reserve um horário na agenda.</span></div>
        <div className="quick-action"><strong>Abrir caixa</strong><span>Inicie o movimento financeiro do dia.</span></div>
        <div className="quick-action"><strong>Cadastrar produto</strong><span>Organize catálogo e estoque.</span></div>
        <div className="quick-action"><strong>Publicar site</strong><span>Atualize sua presença digital.</span></div>
      </div>
    </section>

    <section className="dashboard-columns">
      <div className="panel"><SectionTitle eyebrow="ATIVIDADE" title="Últimas movimentações" /><div className="activity"><div className="activity-item"><div className="activity-dot"/><div><strong>Ambiente configurado</strong><span>Sua empresa está pronta para receber os primeiros dados.</span></div></div><div className="activity-item"><div className="activity-dot"/><div><strong>Site público disponível</strong><span>Personalize serviços, contatos e identidade.</span></div></div><div className="activity-item"><div className="activity-dot"/><div><strong>Segurança ativa</strong><span>Permissões e isolamento multiempresa habilitados.</span></div></div></div></div>
      <div className="panel"><SectionTitle eyebrow="STATUS" title="Operação" /><div className="activity"><div className="activity-item"><div><strong>API</strong><span><Pill tone="success">Operacional</Pill></span></div></div><div className="activity-item"><div><strong>Banco de dados</strong><span><Pill tone="success">Conectado</Pill></span></div></div><div className="activity-item"><div><strong>Site público</strong><span><Pill tone="warning">Aguardando domínio</Pill></span></div></div></div></div>
    </section>
  </Shell>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
