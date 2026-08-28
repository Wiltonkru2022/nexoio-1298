import { Button, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { PageHeader } from '../components/PageHeader';

const items = [
  ['Dados da empresa', 'Nome, documento, contato, endereço e informações públicas.'],
  ['Horários de funcionamento', 'Defina dias, horários e exceções de atendimento.'],
  ['Pagamentos', 'Configure formas de pagamento aceitas pela empresa.'],
  ['Notificações', 'Escolha quais alertas e comunicações deseja receber.'],
  ['Segurança e acessos', 'Sessões, autenticação, MFA e permissões da equipe.'],
  ['Site público', 'Personalize domínio, identidade, textos e canais de contato.'],
];

export function SettingsPage() {
  return <>
    <PageHeader title="Configurações" description="Centralize as preferências, segurança e identidade da sua empresa." action={<Button>Salvar alterações</Button>} />
    <ContentCard title="Configurações da empresa" description="Cada área fica separada para facilitar manutenção e evolução.">
      <div className="settings-list">{items.map(([title, description], index) => <button key={title}><div><span className="settings-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{title}</strong><p>{description}</p></div></div><Pill tone="neutral">Abrir</Pill></button>)}</div>
    </ContentCard>
  </>;
}
