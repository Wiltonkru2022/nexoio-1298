import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import './restaurant.css';

type Item={id:string;description:string;quantity:string;total:string;status:string};
type Order={id:string;status:string;createdAt:string;tab:null|{code:string;channel:string;table:null|{code:string}};items:Item[]};
type Ticket={id:string;status:string;createdAt:string;order:null|{id:string;status:string;items:Item[]};tab:null|{code:string};table:null|{code:string}};
const brl=(v:unknown)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const age=(iso:string)=>Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/60000));
const labels:Record<string,string>={open:'Aberto',sent:'Recebido',queued:'Na fila',preparing:'Cozinha',ready:'Pronto',served:'Finalizado',cancelled:'Cancelado'};
const opTone=(s:string)=>s==='ready'||s==='served'?'green':s==='cancelled'?'red':s==='preparing'?'amber':s==='sent'?'blue':'gray';
const channel=(o:Order)=>o.tab?.table?`Mesa ${o.tab.table.code}`:o.tab?.channel==='delivery'?'Delivery':o.tab?.channel==='pickup'?'Retirada (Balcão)':'Balcão';

export function OrdersPage(){
 const[rows,setRows]=useState<Order[]>([]),[err,setErr]=useState('');
 const load=async()=>{try{setRows((await api.get<{data:Order[]}>('/api/v1/restaurant/orders')).data)}catch(e:any){setErr(e.message)}};
 useEffect(()=>{void load();const t=setInterval(()=>void load(),10000);return()=>clearInterval(t)},[]);
 const change=async(id:string,status:string)=>{try{await api.patch(`/api/v1/restaurant/orders/${id}/status`,{status});await load()}catch(e:any){setErr(e.message)}};
 const newOrder=()=>{history.pushState({},'','/comandas');window.dispatchEvent(new PopStateEvent('popstate'))};
 return <><div className="restaurant-head"><div><small>NEXOIO</small><h1>Pedidos</h1><p>Pedidos de salão, retirada e delivery.</p></div><button className="primary-action" onClick={newOrder}>Novo pedido</button></div><section className="restaurant-panel"><h2>Pedidos cadastrados</h2><p>Informações integradas e isoladas por empresa.</p>{err?<div className="restaurant-error">{err}</div>:null}<div className="operation-grid">{rows.filter(o=>o.status!=='cancelled').map((o,index)=><article className={`operation-card order-reference-card ${opTone(o.status)}`} key={o.id}><div className="operation-top"><span className={`status-chip ${opTone(o.status)}`}>{opTone(o.status)==='red'?'🔴':opTone(o.status)==='amber'?'🟡':opTone(o.status)==='green'?'🟢':'🔵'} {labels[o.status]||o.status}</span><span className="order-state">{labels[o.status]||o.status}</span></div><div className="order-number">#{String(index+1001)}</div><p>◷ {age(o.createdAt)} min | Status: <b>{labels[o.status]||o.status}</b></p><p>▣ {channel(o)}</p>{o.items.slice(0,2).map(i=><div className="detail-item" key={i.id}><span>{i.description} × {Number(i.quantity)}</span><b>{brl(i.total)}</b></div>)}<div className="operation-actions">{['sent','open'].includes(o.status)?<button className="wide-purple" onClick={()=>void change(o.id,'preparing')}>→ Iniciar preparo</button>:null}{o.status==='preparing'?<button className="wide-purple" onClick={()=>void change(o.id,'ready')}>→ Finalizar preparo</button>:null}{o.status==='ready'?<button className="wide-purple" onClick={()=>void change(o.id,'served')}>Entregar</button>:null}</div></article>)}</div>{!rows.length?<div className="restaurant-empty">Nenhum pedido lançado.</div>:null}</section></>;
}

export function KitchenPage(){
 const[rows,setRows]=useState<Ticket[]>([]),[err,setErr]=useState('');
 const load=async()=>{try{setRows((await api.get<{data:Ticket[]}>('/api/v1/restaurant/kitchen')).data)}catch(e:any){setErr(e.message)}};
 useEffect(()=>{void load();const t=setInterval(()=>void load(),7000);return()=>clearInterval(t)},[]);
 const change=async(id:string,status:string)=>{try{await api.patch(`/api/v1/restaurant/kitchen/${id}/status`,{status});await load()}catch(e:any){setErr(e.message)}};
 const active=rows.filter(r=>!['served','cancelled'].includes(r.status));
 return <><div className="restaurant-head"><div><small>NEXOIO</small><h1>Cozinha</h1><p>Fila de preparo em tempo real a partir dos pedidos.</p></div></div><section className="restaurant-panel"><h2>Fila da cozinha</h2><p>Tickets são criados automaticamente quando itens entram em uma comanda.</p>{err?<div className="restaurant-error">{err}</div>:null}<div className="kitchen-grid">{active.map(t=><article className={`kitchen-card ${opTone(t.status)}`} key={t.id}><div className="operation-top"><span className={`status-chip ${opTone(t.status)}`}>{labels[t.status]||t.status}</span><b>{t.tab?.code||'Pedido'}</b></div><h3>{t.table?`Mesa ${t.table.code}`:'Balcão / Delivery'}</h3>{t.order?.items.map(i=><div className="kitchen-item" key={i.id}><strong>{Number(i.quantity)}×</strong><span>{i.description}</span></div>)}<div className="operation-actions">{t.status==='queued'?<button className="wide-purple" onClick={()=>void change(t.id,'preparing')}>Iniciar preparo</button>:null}{t.status==='preparing'?<button className="wide-purple" onClick={()=>void change(t.id,'ready')}>Marcar pronto</button>:null}{t.status==='ready'?<button className="wide-purple" onClick={()=>void change(t.id,'served')}>Entregue</button>:null}</div></article>)}</div>{!active.length?<div className="restaurant-empty">Cozinha sem pedidos pendentes.</div>:null}</section></>;
}