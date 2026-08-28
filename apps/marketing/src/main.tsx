import React from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Button } from '@nexoio/ui';

const features = [
  ['01', 'Operação centralizada', 'Clientes, agenda, vendas, caixa, estoque e financeiro em uma experiência única.'],
  ['02', 'Feito para crescer', 'Arquitetura multiempresa e modular para atender do pequeno negócio a operações maiores.'],
  ['03', 'Presença digital integrada', 'Cada empresa pode ter seu próprio site público conectado à operação e à marca.'],
  ['04', 'Dados com segurança', 'Permissões, auditoria, isolamento por empresa e proteção dos dados desde a fundação.'],
  ['05', 'Automação de verdade', 'Fluxos preparados para reduzir tarefas repetitivas e manter a equipe alinhada.'],
  ['06', 'Visão clara do negócio', 'Indicadores e informações importantes apresentados de forma rápida e organizada.'],
];

function App() {
  return <>
    <div className="hero">
      <nav>
        <Brand />
        <div className="hero-nav">
          <a href="#plataforma">Plataforma</a>
          <a href="#recursos">Recursos</a>
          <a href="#seguranca">Segurança</a>
          <a href="https://app.nexoio.com.br">Entrar</a>
          <Button>Começar agora</Button>
        </div>
      </nav>
      <section>
        <p className="eyebrow">GESTÃO QUE CONECTA</p>
        <h1>Seu negócio, inteiro em um só lugar.</h1>
        <p>A Nexoio conecta operação, clientes, equipe, vendas e presença digital em uma plataforma pensada para empresas brasileiras crescerem com mais clareza.</p>
        <div className="actions"><Button>Começar agora</Button><Button secondary>Conhecer a plataforma</Button></div>
        <div className="hero-proof"><span><strong>Multiempresa</strong> desde a arquitetura</span><span><strong>Cloudflare + Neon</strong> na infraestrutura</span><span><strong>LGPD</strong> e auditoria preparadas</span></div>
      </section>
    </div>
    <main id="plataforma" className="feature-section">
      <div className="section-title"><div><p className="eyebrow">UMA PLATAFORMA, VÁRIOS NEGÓCIOS</p><h2>Menos ferramentas soltas. Mais controle.</h2><p>Uma base consistente para diferentes segmentos, com módulos ativados conforme a necessidade de cada empresa.</p></div></div>
      <div id="recursos" className="feature-grid">{features.map(([icon, title, description]) => <article className="feature-card" key={title}><div className="feature-icon">{icon}</div><h3>{title}</h3><p>{description}</p></article>)}</div>
    </main>
    <section id="seguranca" className="feature-section" style={{paddingTop: 0}}>
      <div className="panel" style={{padding: 36}}><p className="eyebrow">INFRAESTRUTURA PREPARADA</p><h2>Segurança e escala fazem parte da base.</h2><p className="subtitle">Isolamento multiempresa, RBAC, auditoria, idempotência, armazenamento privado e ambientes separados de desenvolvimento, staging e produção.</p><div className="actions"><Button>Quero conhecer</Button><Button ghost>Falar com a Nexoio</Button></div></div>
    </section>
  </>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
