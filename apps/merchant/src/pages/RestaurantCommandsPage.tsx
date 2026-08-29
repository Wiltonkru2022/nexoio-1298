import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState } from '@nexoio/ui';
import { PageHeader } from '../components/PageHeader';
import { Field, Modal } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import './restaurant-operations.css';

type CommandRow={id:string;code:string;table_id:string|null;table_number:string|null;customer_id:string|null;customer_name:string|null;guest_count:number;status:string;total:number|string;opened_at?:string;closed_at?:string|null};
type TableRow={id:string;number:string;status:string};type CustomerRow={id:string;name:string};
const money=(value:number|string)=>Number(value??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const elapsed=(date?:string)=>{if(!date)return'Agora';const minutes=Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/60000));if(minutes<60)return`${minutes} min`;const hours=Math.floor(minutes/60);return`${hours}h ${minutes%60}min`};

export function RestaurantCommandsPage(){
  const[items,setItems]=useState<CommandRow[]>([]);const[tables,setTables]=useState<TableRow[]>([]);const[customers,setCustomers]=useState<CustomerRow[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState('');const[open,setOpen]=useState(false);const[saving,setSaving]=useState(false);const[showClosed,setShowClosed]=useState(false);
  const load=useCallback(async()=>{setLoading(true);setError('');try{const[result,tableResult,customerResult]=await Promise.all([api.get<{data:CommandRow[]}>('/api/v1/commands'),api.get<{data:TableRow[]}>('/api/v1/tables'),api.get<{data:CustomerRow[]}>('/api/v1/customers')]);setItems(result.data);setTables(tableResult.data);setCustomers(customerResult.data)}catch(cause){setError(cause instanceof ApiError?cause.message:'Não foi possível carregar as comandas.')}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  const openItems=useMemo(()=>items.filter(x=>x.status==='open'),[items]);const closedItems=useMemo(()=>items.filter(x=>x.status!=='open'),[items]);const totalOpen=useMemo(()=>openItems.reduce((sum,row)=>sum+Number(row.total??0),0),[openItems]);
  const create=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();setSaving(true);setError('');const form=new FormData(e.currentTarget);const tableId=String(form.get('tableId')??'');const customerId=String(form.get('customerId')??'');try{await api.post('/api/v1/commands',{code:String(form.get('code')??'').trim(),tableId:tableId||undefined,customerId:customerId||undefined,guestCount:Number(form.get('guestCount')??1)||1});setOpen(false);await load()}catch(cause){setError(cause instanceof ApiError?cause.message:'Não foi possível abrir a comanda.')}finally{setSaving(false)}};
  const close=async(row:CommandRow)=>{if(!confirm(`Fechar a comanda ${row.code}?`))return;setError('');try{await api.post(`/api/v1/commands/${row.id}/close`);await load()}catch(cause){setError(cause instanceof ApiError?cause.message:'Não foi possível fechar a comanda.')}};
  const goOrders=()=>{history.pushState({},'','/pedidos');window.dispatchEvent(new PopStateEvent('popstate'))};
  const renderCard=(row:CommandRow)=><article key={row.id} className={`restaurant-op-card command-card ${row.status==='open'?'status-occupied':'status-available'}`}>
    <div className="restaurant-card-top"><span className="restaurant-status"><i/>{row.status==='open'?'Aberta':'Fechada'}</span><span>{elapsed(row.opened_at)}</span></div>
    <div className="restaurant-command-code">Comanda {row.code}</div>
    <div className="restaurant-command-meta"><span><b>{row.table_number?`Mesa ${row.table_number}`:'Sem mesa'}</b></span><span>{row.customer_name||'Consumidor não identificado'}</span><span>{row.guest_count??1} pessoa(s)</span></div>
    <div className="restaurant-command-total"><span>Total lançado</span><strong>{money(row.total)}</strong></div>
    <div className="restaurant-card-actions"><button onClick={goOrders}>{row.status==='open'?'Adicionar / ver pedidos':'Ver pedidos'}</button>{row.status==='open'?<button className="secondary" onClick={()=>void close(row)}>Fechar comanda</button>:null}</div>
  </article>;
  return <>
    <PageHeader title="Comandas" description="Consumo aberto por cliente e mesa, com fechamento controlado." action={<Button onClick={()=>setOpen(true)}>Nova comanda</Button>}/>
    <section className="restaurant-summary command-summary"><div><span>Comandas abertas</span><strong>{openItems.length}</strong></div><div><span>Total em aberto</span><strong>{money(totalOpen)}</strong></div><div><span>Fechadas</span><strong>{closedItems.length}</strong></div></section>
    <div className="restaurant-toolbar"><button className={!showClosed?'active':''} onClick={()=>setShowClosed(false)}>Abertas</button><button className={showClosed?'active':''} onClick={()=>setShowClosed(true)}>Fechadas</button><button onClick={()=>void load()}>Atualizar</button></div>
    {error?<div className="auth-notice error" role="alert">{error} <button onClick={()=>void load()}>Tentar novamente</button></div>:null}
    {loading?<div className="restaurant-loading">Carregando comandas…</div>:(showClosed?closedItems:openItems).length?<section className="restaurant-card-grid">{(showClosed?closedItems:openItems).map(renderCard)}</section>:<EmptyState title={showClosed?'Nenhuma comanda fechada':'Nenhuma comanda aberta'} description={showClosed?'As comandas concluídas aparecerão aqui.':'Abra uma comanda para iniciar o atendimento de uma mesa ou cliente.'} action={!showClosed?<Button onClick={()=>setOpen(true)}>Abrir comanda</Button>:undefined}/>} 
    <Modal open={open} onClose={()=>!saving&&setOpen(false)} onSubmit={create} title="Nova comanda" description="Vincule a uma mesa ou cliente quando necessário.">
      <Field label="Código da comanda" name="code" required/>
      <Field label="Mesa" name="tableId"><select name="tableId" defaultValue=""><option value="">Sem mesa</option>{tables.filter(t=>t.status!=='unavailable').map(t=><option key={t.id} value={t.id}>Mesa {t.number}</option>)}</select></Field>
      <Field label="Cliente" name="customerId"><select name="customerId" defaultValue=""><option value="">Sem cliente</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Quantidade de pessoas" name="guestCount" type="number" required/>
      {saving?<div className="auth-notice">Abrindo comanda…</div>:null}
    </Modal>
  </>;
}
