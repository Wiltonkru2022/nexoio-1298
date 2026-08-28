import React from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Button, Pill } from '@nexoio/ui';

const services = [
  ['Serviço em destaque', 'Atendimento pensado para oferecer uma experiência completa.', 'R$ 0,00'],
  ['Pacote personalizado', 'Combine serviços e condições de acordo com a necessidade do cliente.', 'Sob consulta'],
  ['Atendimento premium', 'Uma opção especial para clientes que buscam mais comodidade.', 'R$ 0,00'],
];

function App() {
  return <>
    <div className="hero">
      <div className="public-header"><Brand/><div className="hero-nav"><a href="#servicos">Serviços</a><a href="#sobre">Sobre</a><a href="#contato">Contato</a><Button>Agendar agora</Button></div></div>
      <section>
        <Pill tone="brand">Template público Nexoio</Pill>
        <p className="eyebrow" style={{marginTop: 20}}>SEU NEGÓCIO, SUA IDENTIDADE</p>
        <h1>Uma presença digital que trabalha junto com a operação.</h1>
        <p>Apresente sua empresa, destaque serviços, facilite o contato e conecte seus clientes diretamente ao seu negócio.</p>
        <div className="actions"><Button>Falar no WhatsApp</Button><Button secondary>Ver serviços</Button></div>
        <div className="hero-proof"><span><strong>Atendimento fácil</strong> pelo celular</span><span><strong>Conteúdo atualizado</strong> pelo painel</span><span><strong>Identidade própria</strong> para cada empresa</span></div>
      </section>
    </div>

    <main id="servicos" className="feature-section">
      <div className="section-title"><div><p className="eyebrow">SERVIÇOS</p><h2>Escolha o que você precisa.</h2><p>Este conteúdo será administrado diretamente pelo painel da empresa.</p></div></div>
      <div className="public-cards">{services.map(([title, description, price]) => <article className="service-card" key={title}><Pill tone="brand">Disponível</Pill><h3 style={{marginTop: 18}}>{title}</h3><p>{description}</p><div className="service-price">{price}</div><div className="actions"><Button secondary>Quero saber mais</Button></div></article>)}</div>
    </main>

    <section id="sobre" className="feature-section" style={{paddingTop: 0}}>
      <div className="dashboard-columns">
        <div className="panel" style={{padding: 34}}><p className="eyebrow">SOBRE</p><h2>Conte sua história de forma simples.</h2><p className="subtitle">Apresente experiência, propósito, diferenciais, equipe e tudo que ajuda o cliente a confiar no seu negócio.</p></div>
        <div id="contato" className="panel" style={{padding: 34}}><p className="eyebrow">CONTATO</p><h2>Pronto para atender.</h2><p className="subtitle">WhatsApp, endereço, horário de funcionamento e redes sociais ficam acessíveis em poucos toques.</p><div className="actions"><Button>Chamar no WhatsApp</Button></div></div>
      </div>
    </section>
  </>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
