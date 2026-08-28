import { Button, EmptyState } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { PageHeader } from '../components/PageHeader';
import { StatGrid } from '../components/StatGrid';

export function ProductsPage() {
  return <>
    <PageHeader title="Produtos" description="Controle catálogo, preços, estoque e disponibilidade dos seus produtos." action={<Button>Novo produto</Button>} />
    <StatGrid items={[{ label: 'Produtos ativos', value: '0' }, { label: 'Estoque baixo', value: '0' }, { label: 'Sem estoque', value: '0' }, { label: 'Valor em estoque', value: 'R$ 0,00' }]} />
    <ContentCard title="Catálogo de produtos" description="Gerencie itens vendidos ou utilizados no seu negócio." action={<div className="toolbar"><input placeholder="Buscar produto..."/><button>Categorias</button></div>}>
      <div className="catalog-grid"><EmptyState title="Nenhum produto cadastrado" description="Adicione produtos e controle estoque, preço e disponibilidade." action={<Button>Novo produto</Button>} /></div>
    </ContentCard>
  </>;
}
