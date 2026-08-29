import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState } from '@nexoio/ui';
import { PageHeader } from '../components/PageHeader';
import { api, ApiError } from '../lib/api';
import './restaurant-operations.css';

type Order={id:string;tab_id?:string|null;table_id?:string|null;channel:string;status:string;total:number|string;payment_status?:string;fulfillment_status?:string;customer_name?:string|null;table_number?:string|null;created_at?:string;items?:Array<{id:string;description:string;quantity:number;total:number|string}>};
type Check={id:string;code:string;table_id:string|null;table_number:string|null;due:number|string};
type ChannelFilter='all'|'table'|'counter'|'pickup'|'delivery';
type StageFilter='active'|'preparing'|'ready';
const brl=(v:number|string|undefined)=>Number(v??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const elapsed=(d?:string)=>d?`${Math.max(0,Math.floor((Date.now()-new Date(d).getTime())/60000))} min`:'agora';
const fail=(e:unknown,fallback:string)=>e instanceof ApiError?e.message:fallback;
const go=(path:string)=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'))};
const channelLabel=(o:Order)=>o.table_id?'Mesa':o.tab_id?'Comanda':o.channel==='pickup'?'Retirada':o.channel==='delivery'?'Delivery':'Balcão';

export function RestaurantOrdersPage(){
 const[orders,setOrders]=useState<Order[]>([]);const[checks,setChecks]=useState<Check[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState('');const[channel,setChannel]=useState<ChannelFilter>('all');const[stage,setStage]=useState<StageFilter>('active');const[busy,setBusy]=useState('');
 const load=useCallback(async(force=false)=>{setLoading(orders.length===0);setError('');try{const[o,c]=await Promise.all([api.get<{data:Order[]}>('/api/v1/orders',{force}),api.get<{data:Check[]}>('/api/v1/restaurant/checks',{force})]);setOrders(o.data);setChecks(c.data)}catch(e){setError(fail(e,'Não foi possível carregar os pedidos.'))}finally{setLoading(false)}},[orders.length]);
 useEffect(()=>{void load()},[load]);
 const checkById=useMemo(()=>new Map(checks.map(x=>[x.id,x])),[checks]);
 const active=useMemo(()=>orders.filter(o=>!['closed','cancelled'].includes(o.status)),[orders]);
 const visible=useMemo(()=>active.filter(o=>{
   const channelOk=channel==='all'||(channel==='table'&&Boolean(o.table_id||o.tab_id))||(channel==='counter'&&!o.table_id&&!o.tab_id&&!['pickup','delivery'].includes(o.channel))||o.channel===channel;
   const stageOk=stage==='active'||(stage==='preparing'&&o.fulfillment_status==='preparing')||(stage==='ready'&&o.fulfillment_status==='ready');
   return channelOk&&stageOk;
 }),[active,channel,stage]);
 const counts=useMemo(()=>({all:active.length,table:active.filter(o=>o.table_id||o.tab_id).length,counter:active.filter(o=>!o.table_id&&!o.tab_id&&!['pickup','delivery'].includes(o.channel)).length,pickup:active.filter(o=>o.channel==='pickup').length,delivery:active.filter(o=>o.channel==='delivery').length}),[active]);
 const kitchen=async(id:string)=>{setBusy(id);try{await api.post(`/api/v1/orders/${id}/kitchen`,{});await load(true)}catch(e){setError(fail(e,'Não foi possível enviar para a produção.'))}finally{setBusy('')}};
 const closePickup=async(o:Order)=>{setBusy(o.id);try{await api.post(`/api/v1/orders/${o.id}/close`,{});await load(true)}catch(e){setError(fail(e,'Não foi possível finalizar a retirada.'))}finally{setBusy('')}};
 const tone=(o:Order)=>o.fulfillment_status==='ready'?'green':o.fulfillment_status==='preparing'||o.status==='confirmed'?'yellow':o.channel==='delivery'?'blue':'red';
 const openAttendance=(o:Order)=>{const tab=o.tab_id?checkById.get(o.tab_id):undefined;const q=new URLSearchParams({from:o.tab_id?'comandas':'mesas'});if(o.table_id)q.set('tableId',o.table_id);if(o.tab_id)q.set('tabId',o.tab_id);if(tab?.code)q.set('command',tab.code);go(`/atendimento?${q}`)};
 const primaryAction=(o:Order)=>{
   if(o.tab_id||o.table_id)return <button onClick={()=>openAttendance(o)}>Abrir atendimento</button>;
   if(o.channel==='delivery')return <button onClick={()=>go('/delivery')}>Acompanhar entrega</button>;
   if(o.fulfillment_status==='ready'&&o.payment_status!=='paid')return <button onClick={()=>go(`/caixa?orderId=${o.id}`)}>Receber no caixa</button>;
   if(o.channel==='pickup'&&o.fulfillment_status==='ready'&&o.payment_status==='paid')return <button disabled={busy===o.id} onClick={()=>void closePickup(o)}>{busy===o.id?'Finalizando…':'Entregar e finalizar'}</button>;
   if(o.fulfillment_status==='preparing')return <button onClick={()=>go('/cozinha')}>Acompanhar produção</button>;
   if(o.payment_status!=='paid'&&o.channel==='counter'&&o.fulfillment_status==='ready')return <button onClick={()=>go(`/caixa?orderId=${o.id}`)}>Receber no caixa</button>;
   return <button onClick={()=>go(`/caixa?orderId=${o.id}`)}>Abrir no caixa</button>;
 };
 return <><PageHeader title="Pedidos" description="Um único painel para mesa, comanda, balcão, retirada e delivery. Produção e entrega continuam como etapas do mesmo pedido." action={<div className="row-actions"><Button ghost onClick={()=>go('/atendimento?channel=counter&from=pedidos')}>Novo balcão</Button><Button ghost onClick={()=>go('/atendimento?channel=pickup&from=pedidos')}>Nova retirada</Button><Button ghost onClick={()=>go('/atendimento?channel=delivery&from=pedidos')}>Novo delivery</Button><Button onClick={()=>go('/mesas')}>Abrir mesa</Button></div>}/>{error?<div className="auth-notice error" role="alert">{error}</div>:null}<div className="restaurant-toolbar"><button className={channel==='all'?'active':''} onClick={()=>setChannel('all')}>Todos ({counts.all})</button><button className={channel==='table'?'active':''} onClick={()=>setChannel('table')}>Mesa/Comanda ({counts.table})</button><button className={channel==='counter'?'active':''} onClick={()=>setChannel('counter')}>Balcão ({counts.counter})</button><button className={channel==='pickup'?'active':''} onClick={()=>setChannel('pickup')}>Retirada ({counts.pickup})</button><button className={channel==='delivery'?'active':''} onClick={()=>setChannel('delivery')}>Delivery ({counts.delivery})</button><button className={stage==='active'?'active':''} onClick={()=>setStage('active')}>Em aberto</button><button className={stage==='preparing'?'active':''} onClick={()=>setStage('preparing')}>Em preparo</button><button className={stage==='ready'?'active':''} onClick={()=>setStage('ready')}>Prontos</button><button onClick={()=>void load(true)}>Atualizar</button></div>{loading?<div className="restaurant-loading">Carregando pedidos…</div>:visible.length?<section className="restaurant-order-grid">{visible.map(o=>{const tab=o.tab_id?checkById.get(o.tab_id):undefined;return <article key={o.id} className={`order-board-card tone-${tone(o)}`}><div className="order-board-tags"><span>{channelLabel(o)}</span><b>{o.fulfillment_status||o.status}</b></div><h2>#{String(o.id).slice(-4).toUpperCase()}</h2><p>◷ {elapsed(o.created_at)} · <strong>{o.table_number?`Mesa ${o.table_number}`:channelLabel(o)}</strong></p>{tab?<p>Comanda <strong>{tab.code}</strong></p>:null}{o.customer_name?<p>Cliente <strong>{o.customer_name}</strong></p>:null}<div className="order-items-mini">{(o.items??[]).slice(0,5).map(x=><span key={x.id}>{Number(x.quantity)}× {x.description}</span>)}</div><div className="order-board-footer"><div><strong>{brl(o.total)}</strong><small>{o.payment_status==='paid'?'Pago':'Pagamento pendente'}</small></div><div>{o.fulfillment_status!=='preparing'&&o.fulfillment_status!=='ready'&&!o.table_id&&!o.tab_id?<button disabled={busy===o.id} onClick={()=>void kitchen(o.id)}>{busy===o.id?'Enviando…':'Enviar à produção'}</button>:null}{primaryAction(o)}</div></div></article>})}</section>:<EmptyState title="Nenhum pedido neste filtro" description="Crie um pedido de balcão, retirada, delivery ou abra uma mesa." action={<Button onClick={()=>go('/atendimento?channel=counter&from=pedidos')}>Novo balcão</Button>}/>}</>;
}
