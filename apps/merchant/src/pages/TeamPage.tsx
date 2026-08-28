import { Button, EmptyState, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { PageHeader } from '../components/PageHeader';
import { StatGrid } from '../components/StatGrid';

export function TeamPage() {
  return <>
    <PageHeader title="Equipe" description="Gerencie profissionais, permissões, agenda e vínculo com serviços." action={<Button>Adicionar pessoa</Button>} />
    <StatGrid items={[{ label: 'Membros ativos', value: '0' }, { label: 'Profissionais', value: '0' }, { label: 'Administradores', value: '0' }, { label: 'Convites pendentes', value: '0' }]} />
    <ContentCard title="Pessoas e acessos" description="Controle quem pode acessar cada área da empresa." action={<Pill tone="brand">RBAC ativo</Pill>}>
      <div className="table-shell"><table><thead><tr><th>Nome</th><th>Função</th><th>Serviços</th><th>Status</th><th></th></tr></thead><tbody><tr><td colSpan={5}><EmptyState title="Sua equipe começa aqui" description="Adicione profissionais e defina acessos de forma segura." action={<Button>Adicionar pessoa</Button>} /></td></tr></tbody></table></div>
    </ContentCard>
  </>;
}
