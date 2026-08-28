import { useState } from 'react';
import { Button, Metric, Pill, SectionTitle, Shell } from '@nexoio/ui';

type AdminView = 'resumo' | 'empresas' | 'planos' | 'consumo' | 'financeiro' | 'auditoria' | 'incidentes' | 'configuracoes';

const items: Array<{ key: AdminView; label: string }> = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'empresas', label: 'Empresas' },
  { key: 'planos', label: 'Planos' },
  { key: 'consumo', label: 'Consumo' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'auditoria', label: 'Auditoria' },
  { key: 'incidentes', label: 'Incidentes' },
  { key: 'configuracoes', label: 'Configurações' },
];

function EmptyPanel({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <section className="panel"><SectionTitle eyebrow={eyebrow} title={title} description={description} /><div className="empty-state"><div className="empty-icon">✦</div><h3>Nenhum registro ainda</h3><p>Os dados aparecerão aqui assim que a API retornar informações para este módulo.</p></div></section>;
}

function Summary() {
  return <>
    <section className="grid">
      <Metric label="Empresas ativas" value="0" trend="0%" note="Nenhuma empresa ativa ainda" />
      <Metric label="MRR" value="R$ 0" note="Receita recorrente mensal" />
      <Metric label="Requisições hoje" value="0" note="Dentro da faixa esperada" />
      <Metric label="Alertas críticos" value="0" note="Nenhuma ação necessária" />
    </section>
    <section className="dashboard-columns">
      <div className="panel"><SectionTitle eyebrow="PLATAFORMA" title="Saúde operacional" description="Status dos principais componentes da infraestrutura." /><div className="activity"><div className="activity-item"><div className="activity-dot"/><div><strong>API</strong><span>Cloudflare Worker principal</span></div><Pill tone="success">Operacional</Pill></div><div className="activity-item"><div className="activity-dot"/><div><strong>Neon PostgreSQL</strong><span>Banco principal da plataforma</span></div><Pill tone="success">Conectado</Pill></div><div className="activity-item"><div className="activity-dot"/><div><strong>Cloudflare R2</strong><span>Arquivos privados</span></div><Pill tone="success">Disponível</Pill></div></div></div>
      <div className="panel"><SectionTitle eyebrow="CONSUMO" title="Últimos 7 dias" description="Leitura visual de uso da plataforma." /><div className="chart">{[18,30,26,44,38,58,49].map((h,i)=><div key={i} className="bar" style={{height:`${h}%`}}/>)}</div><div className="bar-labels"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div></div>
    </section>
  </>;
}

const viewContent: Record<Exclude<AdminView, 'resumo'>, { eyebrow: string; title: string; description: string }> = {
  empresas: { eyebrow: 'EMPRESAS', title: 'Empresas da plataforma', description: 'Gerencie contas, situação, módulos e acesso.' },
  planos: { eyebrow: 'PLANOS', title: 'Planos e limites', description: 'Administre planos comerciais, recursos e entitlements.' },
  consumo: { eyebrow: 'CONSUMO', title: 'Consumo da plataforma', description: 'Acompanhe requisições, armazenamento e uso por empresa.' },
  financeiro: { eyebrow: 'FINANCEIRO', title: 'Financeiro da Nexoio', description: 'Acompanhe receita recorrente, cobranças e situação financeira.' },
  auditoria: { eyebrow: 'AUDITORIA', title: 'Auditoria', description: 'Consulte ações administrativas e eventos sensíveis.' },
  incidentes: { eyebrow: 'INCIDENTES', title: 'Incidentes', description: 'Registre e acompanhe eventos críticos da plataforma.' },
  configuracoes: { eyebrow: 'CONFIGURAÇÕES', title: 'Configurações da plataforma', description: 'Defina políticas e parâmetros globais da Nexoio.' },
};

export function App() {
  const [view, setView] = useState<AdminView>('resumo');
  const nav = <nav className="admin-nav">{items.map(item => <button key={item.key} type="button" className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}>{item.label}</button>)}</nav>;
  return <Shell title="Controle da plataforma" subtitle="Administração Master da Nexoio." nav={nav} actions={<Button ghost onClick={() => location.reload()}>Atualizar</Button>}>
    {view === 'resumo' ? <Summary /> : <EmptyPanel {...viewContent[view]} />}
  </Shell>;
}
