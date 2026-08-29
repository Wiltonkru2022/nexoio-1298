import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState } from '@nexoio/ui';
import { PageHeader } from '../components/PageHeader';
import { api, ApiError } from '../lib/api';
import './restaurant-operations.css';

type Order={id:string;tab_id?:string|null;table_id?:string|null;channel:string;status:string;total:number|string;payment_status?:string;fulfillment_status?:string;customer_name?:string|null;table_number?:string|null;created_at?:string;items?:Array<{id:string;description:string;quantity:number;total:number|string}>};
type Check={id:string;code:string;table_id:string|null;table_number:string|null;due:number|string};
const brl=(v:number|string|undefined)=>Number(v??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const elapsed=(d?:string)=>d?`${Math.max(0,Math.floor((Date.now()-new Date(d).getTime())/60000))} min`:'agora';
const fail=(e:unknown,fallback:string)=>e instanceof ApiError?e.message:fallback;
const go=(path:string)=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'))};

export function RestaurantOrdersPage(){
 const[orders,setOrders]=useState<Order[]>([]);const[checks,setChecks]=useState<Check[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const[o,c]=await Promise.all([api.get<{data:Order[]}>('/api/v1/orders'),api.get<{data:Check[]}>('/api/v1/restaurant/checks')]);setOrders(o.data);setChecks(c.data)}catch(e){setError(fail(e,'Não foi possível carregar os pedidos.'))}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);
 const checkById=useMemo(()=>new Map(checks.map(x=>[x.id,x])),[checks]);const active=orders.filter(o=>!['closed','cancelled'].includes(o.status));
 const kitchen=async(id:string)=>{try{await api.post(`/api/v1/orders/${id}/kitchen`,{});await load()}catch(e){setError(fail(e,'Não foi possível enviar para a cozinha.'))}};
 const tone=(o:Order)=>o.fulfillment_status==='ready'?'green':o.fulfillment_status==='preparing'||o.status==='confirmed'?'yellow':o.channel==='delivery'?'blue':'red';
 const openAccount=(o:Order)=>{if(o.tab_id||o.table_id){const tab=o.tab_id?checkById.get(o.tab_id):undefined;const q=new URLSearchParams({from:o.tab_id?'comandas':'mesas'});if(o.table_id)q.set('tableId',o.table_id);if(o.tab_id)q.set('tabId',o.tab_id);if(tab?.code)q.set('command',tab.code);go(`/atendimento?${q}`);return}if(o.channel==='delivery')go('/delivery');else if(o.channel==='pickup')go('/retirada');else go(`/caixa?orderId=${o.id}`)};
 return <><PageHeader title="Pedidos" description="Painel de acompanhamento. Novos pedidos são montados dentro do atendimento da mesa/comanda, retirada ou delivery." action={<div className="row-actions"><Button ghost onClick={()=>go('/atendimento?channel=pickup&from=pedidos')}>Nova retirada</Button><Button ghost onClick={()=>go('/atendimento?channel=delivery&from=pedidos')}>Novo delivery</Button><Button onClick={()=>go('/mesas')}>Abrir mesa</Button></div>}/>{error?<div className="auth-notice error">{error}</div>:null}{loading?<div className="restaurant-loading">Carregando pedidos…</div>:active.length?<section className="restaurant-order-grid">{active.map(o=>{const tab=o.tab_id?checkById.get(o.tab_id):undefined;return <article key={o.id} className={`order-board-card tone-${tone(o)}`}><div className="order-board-tags"><span>{tone(o)==='red'?'Novo':tone(o)==='yellow'?'Em preparo':tone(o)==='green'?'Pronto':'Delivery'}</span><b>{o.fulfillment_status||o.status}</b></div><h2>#{String(o.id).slice(-4).toUpperCase()}</h2><p>◷ {elapsed(o.created_at)} · <strong>{o.table_number?`Mesa ${o.table_number}`:o.channel==='pickup'?'Retirada':o.channel==='delivery'?'Delivery':'Balcão'}</strong></p>{tab?<p>Comanda <strong>{tab.code}</strong></p>:null}<div className="order-items-mini">{(o.items??[]).slice(0,4).map(x=><span key={x.id}>{x.quantity}× {x.description}</span>)}</div><div className="order-board-footer"><strong>{brl(o.total)}</strong><div>{o.fulfillment_status!=='preparing'&&o.fulfillment_status!=='ready'?<button onClick={()=>void kitchen(o.id)}>Enviar à cozinha</button>:null}<button onClick={()=>openAccount(o)}>{o.tab_id||o.table_id?'Abrir atendimento':o.channel==='delivery'?'Ver delivery':o.channel==='pickup'?'Ver retirada':'Receber no caixa'}</button></div></div></article>})}</section>:<EmptyState title="Nenhum pedido em aberto" description="Abra uma mesa, retirada ou delivery para criar o próximo pedido." action={<Button onClick={()=>go('/mesas')}>Abrir mesa</Button>}/>}</>;
}
