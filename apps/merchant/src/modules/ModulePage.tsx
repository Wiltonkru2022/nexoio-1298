import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { Field, Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { api, ApiError } from '../lib/api';

type ModuleRecord = {
  id: string;
  name: string;
  details: string | null;
  status: string;
  createdAt: string;
};

export function ModulePage({ moduleKey, title, description, statuses = ['Ativo'] }: { moduleKey: string; title: string; description: string; statuses?: string[] }) {
  const [items, setItems] = useState<ModuleRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ data: ModuleRecord[] }>(`/api/v1/module-records/${encodeURIComponent(moduleKey)}`);
      setItems(response.data);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível carregar os dados.');
    } finally {
      setLoading(false);
    }
  }, [moduleKey]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api.post(`/api/v1/module-records/${encodeURIComponent(moduleKey)}`, {
        name: String(form.get('name') ?? ''),
        details: String(form.get('details') ?? ''),
        status: String(form.get('status') ?? statuses[0] ?? 'Ativo'),
      });
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar o registro.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Remover este registro?')) return;
    try {
      await api.delete(`/api/v1/module-records/${encodeURIComponent(moduleKey)}/${id}`);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível remover o registro.');
    }
  };

  return <>
    <PageHeader title={title} description={description} action={<Button onClick={() => setOpen(true)}>Novo registro</Button>} />
    <ContentCard title={`Registros de ${title}`} description="Dados salvos no Neon e isolados pela empresa ativa.">
      {error ? <div className="auth-notice error" role="alert">{error} <button onClick={() => void load()}>Tentar novamente</button></div> : null}
      {loading ? <div className="empty-state"><h3>Carregando…</h3><p>Buscando dados da empresa ativa.</p></div> : items.length ? <div className="table-shell"><table><thead><tr><th>Nome</th><th>Detalhes</th><th>Status</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.details || '—'}</td><td><Pill tone="brand">{item.status}</Pill></td><td className="row-actions"><button onClick={() => void remove(item.id)}>Remover</button></td></tr>)}</tbody></table></div> : <EmptyState title={`Nenhum registro em ${title}`} description="Use o botão para criar o primeiro registro." action={<Button onClick={() => setOpen(true)}>Novo registro</Button>} />}
    </ContentCard>
    <Modal open={open} onClose={() => !saving && setOpen(false)} onSubmit={submit} title={`Novo registro — ${title}`}>
      <Field label="Nome/identificação" name="name" required />
      <Field label="Detalhes" name="details" required />
      <Field label="Status" name="status"><select name="status">{statuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
      {saving ? <div className="auth-notice">Salvando no Neon…</div> : null}
    </Modal>
  </>;
}
