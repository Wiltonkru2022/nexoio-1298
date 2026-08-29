import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState } from '@nexoio/ui';
import { PageHeader } from '../components/PageHeader';
import { Field, Modal } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import './restaurant-operations.css';

type TableRow={id:string;number:string;seats:number|null;status:'available'|'occupied'|'reserved'|'unavailable';created_at?:string};
type TableFilter='all'|TableRow['status'];
const labels:Record<TableRow['status'],string>={available:'Livre',occupied:'Ocupada',reserved:'Reservada',unavailable:'Indisponível'};

export function RestaurantTablesPage(){
  const[items,setItems]=useState<TableRow[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState('');const[open,setOpen]=useState(false);const[saving,setSaving]=useState(false);const[filter,setFilter]=useState<TableFilter>('all');
  const load=useCallback(async()=>{setLoading(true);setError('');try{const result=await api.get<{data:TableRow[]}>('/api/v1/tables');setItems(result.data)}catch(cause){setError(cause instanceof ApiError?cause.message:'Não foi possível carregar as mesas.')}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  const counts=useMemo(()=>({all:items.length,available:items.filter(x=>x.status==='available').length,occupied:items.filter(x=>x.status==='occupied').length,reserved:items.filter(x=>x.status==='reserved').length,unavailable:items.filter(x=>x.status==='unavailable').length}),[items]);
  const visible=filter==='all'?items:items.filter(x=>x.status===filter);
  const create=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();setSaving(true);setError('');const form=new FormData(e.currentTarget);try{await api.post('/api/v1/tables',{number:String(form.get('number')??'').trim(),seats:Number(form.get('seats')??0)||undefined});setOpen(false);await load()}catch(cause){setError(cause instanceof ApiError?cause.message:'Não foi possível criar a mesa.')}finally{setSaving(false)}};
  const changeStatus=async(table:TableRow,status:TableRow['status'])=>{if(status===table.status)return;setError('');try{await api.patch(`/api/v1/tables/${table.id}/status`,{status});setItems(current=>current.map(row=>row.id===table.id?{...row,status}:row))}catch(cause){setError(cause instanceof ApiError?cause.message:'Não foi possível alterar o status da mesa.')}};
  return <>
    <PageHeader title="Mesas" description="Acompanhe a ocupação do salão em tempo real." action={<Button onClick={()=>setOpen(true)}>Nova mesa</Button>}/>
    <section className="restaurant-summary" aria-label="Resumo das mesas">
      <button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}><span>Total</span><strong>{counts.all}</strong></button>
      <button className={filter==='available'?'active':''} onClick={()=>setFilter('available')}><span>Livres</span><strong>{counts.available}</strong></button>
      <button className={filter==='occupied'?'active':''} onClick={()=>setFilter('occupied')}><span>Ocupadas</span><strong>{counts.occupied}</strong></button>
      <button className={filter==='reserved'?'active':''} onClick={()=>setFilter('reserved')}><span>Reservadas</span><strong>{counts.reserved}</strong></button>
    </section>
    {error?<div className="auth-notice error" role="alert">{error} <button onClick={()=>void load()}>Tentar novamente</button></div>:null}
    {loading?<div className="restaurant-loading">Carregando mesas…</div>:visible.length?<section className="restaurant-card-grid">{visible.map(table=><article key={table.id} className={`restaurant-op-card status-${table.status}`}>
      <div className="restaurant-card-top"><span className="restaurant-status"><i/>{labels[table.status]}</span><span className="restaurant-seat-count">{table.seats??'—'} lugares</span></div>
      <div className="restaurant-table-number">Mesa {table.number}</div>
      <p className="restaurant-card-copy">{table.status==='available'?'Pronta para receber clientes.':table.status==='occupied'?'Atendimento em andamento.':table.status==='reserved'?'Reservada para atendimento.':'Fora da operação no momento.'}</p>
      <label className="restaurant-inline-field">Status<select value={table.status} onChange={e=>void changeStatus(table,e.target.value as TableRow['status'])}><option value="available">Livre</option><option value="occupied">Ocupada</option><option value="reserved">Reservada</option><option value="unavailable">Indisponível</option></select></label>
      <div className="restaurant-card-actions"><button onClick={()=>{history.pushState({},'','/comandas');window.dispatchEvent(new PopStateEvent('popstate'))}}>{table.status==='available'?'Abrir comanda':'Ver comandas'}</button></div>
    </article>)}</section>:<EmptyState title="Nenhuma mesa cadastrada" description="Cadastre as mesas do salão para acompanhar ocupação e comandas." action={<Button onClick={()=>setOpen(true)}>Cadastrar mesa</Button>}/>} 
    <Modal open={open} onClose={()=>!saving&&setOpen(false)} onSubmit={create} title="Nova mesa"><Field label="Número ou nome" name="number" required/><Field label="Quantidade de lugares" name="seats"><input name="seats" type="number" min="1" max="100" required/></Field>{saving?<div className="auth-notice">Salvando mesa…</div>:null}</Modal>
  </>;
}
