import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import './restaurant.css';

type Item={id:string;description:string;quantity:string;total:string;status:string};
type Order={id:string;status:string;createdAt:string;tab:null|{code:string;channel:string;table:null|{code:string}};items:Item[]};
type Ticket={id:string;status:string;createdAt:string;order:null|{id:string;status:string;items:Item[]};tab:null|{code:string};table:null|{code:string}};
const brl=(v:unknown)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const labels:Record<string,string>={open:'Aberto',sent:'Enviado',queued:'Na fila',preparing:'Preparando',ready:'Pronto',served:'Entregue',cancelled:'Cancelado'};
const opTone=(s:string)=>s==='ready'||s==='served'?'green':s==='cancelled'?'red':s==='preparing'?'amber':'gray';

export function OrdersPage(){
 const[rows,setRows]=useState<Order[]>([]),[err,setErr]=useState('');
 const load=async()=>{try{setRows((await api.get<{data:Order[]}>('/api/v1/restaurant/orders')).data)}catch(e:any){setErr(e.message)}};
 useEffect(()=>{void load();const t=setInterval(()=>void load(),10000);return()=>clearInterval(t)},[]);
 const change=async(id:string,status:string)=>{try{await api.patch(`/api/v1/restaurant/orders/${id}/status`,{status});await load()}catch(e:any){setErr(e.message)}};
 return <><div className="restaurant-head"><div><small>NEXOIO</small><h1>Pedidos</h1><p>Pedidos reais ligados às comandas e à cozinha.</p></div></div><section className="restaurant-panel"><h2>Pedidos</h2><p>Cada pedido abaixo existe no banco da empresa atual.</p>{err?<div className="restaurant-error">{err}</div>:null}<div className="operation-grid">{rows.map(o=><article className="operation-card" key={o.id}><div className="operation-top"><span className={`status-chip ${opTone(o.status)}`}>{labels[o.status]||o.status}</span><b>{o.tab?.code||'Comanda'}</b></div><p>{o.tab?.table?`Mesa ${o.tab.table.code}`:o.tab?.channel||'Balcão'}</p>{o.items.map(i=><div className="detail-item" key={i.id}><span>{i.description} × {Number(i.quantity)}</span><b>{brl(i.total)}</b></div>)}<div className="operation-actions"><button onClick={()=>void change(o.id,'preparing')}>Preparando</button><button onClick={()=>void change(o.id,'ready')}>Pronto</button><button onClick={()=>void change(o.id,'served')}>Entregue</button><button onClick={()=>void change(o.id,'cancelled')}>Cancelar</button></div></article>)}</div>{!rows.length?<div className="restaurant-empty">Nenhum pedido lançado.</div>:null}</section></>;
}

export function KitchenPage(){
 const[rows,setRows]=useState<Ticket[]>([]),[err,setErr]=useState('');
 const load=async()=>{try{setRows((await api.get<{data:Ticket[]}>('/api/v1/restaurant/kitchen')).data)}catch(e:any){setErr(e.message)}};
 useEffect(()=>{void load();const t=setInterval(()=>void load(),7000);return()=>clearInterval(t)},[]);
 const change=async(id:string,status:string)=>{try{await api.patch(`/api/v1/restaurant/kitchen/${id}/status`,{status});await load()}catch(e:any){setErr(e.message)}};
 const active=rows.filter(r=>!['served','cancelled'].includes(r.status));
 return <><div className="restaurant-head"><div><small>NEXOIO</small><h1>Cozinha</h1><p>Fila de preparo em tempo real a partir dos pedidos.</p></div></div><section className="restaurant-panel"><h2>Fila da cozinha</h2><p>Tickets são criados quando itens entram em uma comanda.</p>{err?<div className="restaurant-error">{err}</div>:null}<div className="kitchen-grid">{active.map(t=><article className={`kitchen-card ${opTone(t.status)}`} key={t.id}><div className="operation-top"><span className={`status-chip ${opTone(t.status)}`}>{labels[t.status]||t.status}</span><b>{t.tab?.code||'Pedido'}</b></div><h3>{t.table?`Mesa ${t.table.code}`:'Balcão / Delivery'}</h3>{t.order?.items.map(i=><div className="kitchen-item" key={i.id}><strong>{Number(i.quantity)}×</strong><span>{i.description}</span></div>)}<div className="operation-actions"><button onClick={()=>void change(t.id,'preparing')}>Iniciar preparo</button><button onClick={()=>void change(t.id,'ready')}>Marcar pronto</button><button onClick={()=>void change(t.id,'served')}>Entregue</button></div></article>)}</div>{!active.length?<div className="restaurant-empty">Cozinha sem pedidos pendentes.</div>:null}</section></>;
}