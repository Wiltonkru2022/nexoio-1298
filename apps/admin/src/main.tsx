import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Metric, Pill, SectionTitle, Shell } from '@nexoio/ui';

const Nav = () => <nav className="nav"><a className="active">Resumo</a><a>Empresas</a><a>Planos</a><a>Consumo</a><a>Financeiro</a><a>Auditoria</a><a>Incidentes</a><a>Configurações</a></nav>;

function App() {
  return <Shell title="Controle da plataforma" subtitle="Visão central da operação Nexoio, com segurança, consumo, empresas e eventos críticos em um só lugar." nav={<Nav />} actions={<><Button ghost>Exportar</Button><Button>Nova empresa</Button></>}>
    <section className="grid">
      <Metric label="Empresas ativas" value="0" trend="0%" note="Nenhuma empresa ativa ainda" />
      <Metric label="MRR" value="R$ 0" note="Receita recorrente mensal" />
      <Metric label="Requisições hoje" value="0" note="Dentro da faixa esperada" />
      <Metric label="Alertas críticos" value="0" note="Nenhuma ação necessária" />
    </section>

    <section className="dashboard-columns">
      <div className="panel">
        <SectionTitle eyebrow="PLATAFORMA" title="Saúde operacional" description="Status dos principais componentes da infraestrutura." />
        <div className="activity">
          <div className="activity-item"><div className="activity-dot"/><div><strong>API de produção</strong><span>Worker principal da plataforma</span></div><Pill tone="success">Operacional</Pill></div>
          <div className="activity-item"><div className="activity-dot"/><div><strong>Neon PostgreSQL</strong><span>Banco principal e isolamento multiempresa</span></div><Pill tone="success">Conectado</Pill></div>
          <div className="activity-item"><div className="activity-dot"/><div><strong>Cloudflare R2</strong><span>Armazenamento privado de arquivos</span></div><Pill tone="success">Disponível</Pill></div>
          <div className="activity-item"><div className="activity-dot"/><div><strong>Domínio principal</strong><span>Propagação e ativação DNS</span></div><Pill tone="warning">Pendente</Pill></div>
        </div>
      </div>
      <div className="panel">
        <SectionTitle eyebrow="CONSUMO" title="Últimos 7 dias" description="Leitura visual de uso da plataforma." />
        <div className="chart">{[18,30,26,44,38,58,49].map((h, i) => <div key={i} className="bar" style={{height: `${h}%`}} />)}</div>
        <div className="bar-labels"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div>
      </div>
    </section>

    <section className="panel">
      <SectionTitle eyebrow="EMPRESAS" title="Visão das contas" description="Contas recentes, plano contratado e situação operacional." action={<Button ghost>Ver todas</Button>} />
      <table className="admin-table"><thead><tr><th>Empresa</th><th>Plano</th><th>Status</th><th>Usuários</th><th>Última atividade</th></tr></thead><tbody><tr><td><strong>Nenhuma empresa cadastrada</strong></td><td>—</td><td><Pill>Sem dados</Pill></td><td>0</td><td>—</td></tr></tbody></table>
    </section>

    <section className="dashboard-columns">
      <div className="panel"><SectionTitle eyebrow="SEGURANÇA" title="Eventos recentes" /><div className="empty-state"><div className="empty-icon">✓</div><h3>Nenhum incidente</h3><p>Eventos de segurança, auditoria e ações administrativas sensíveis aparecerão aqui.</p></div></div>
      <div className="panel"><SectionTitle eyebrow="ATALHOS" title="Administração" /><div className="quick-grid"><div className="quick-action"><strong>Empresas</strong><span>Gerenciar contas e módulos.</span></div><div className="quick-action"><strong>Planos</strong><span>Regras comerciais e limites.</span></div><div className="quick-action"><strong>Auditoria</strong><span>Consultar ações sensíveis.</span></div></div></div>
    </section>
  </Shell>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
