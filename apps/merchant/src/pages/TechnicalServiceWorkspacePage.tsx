import { useCallback, useEffect, useState } from 'react';
import { ContentCard } from '../components/ContentCard';
import { api, ApiError } from '../lib/api';
import { ServiceOrderResourcesPanel } from './ServiceOrderResourcesPanel';
import { ServiceOrdersPage } from './ServiceOrdersPage';

type ServiceOrder={id:string;number:number;subject?:string|null;customer_name?:string|null;status:string};

export function TechnicalServiceWorkspacePage(){
  const[orders,setOrders]=useState<ServiceOrder[]>([]);const[selectedId,setSelectedId]=useState('');const[error,setError]=useState('');
  const load=useCallback(async(force=false)=>{try{const response=await api.get<{data:ServiceOrder[]}>('/api/v1/service-orders',{force});setOrders(response.data);setSelectedId(current=>current&&response.data.some(x=>x.id===current)?current:(response.data.find(x=>!['delivered','cancelled'].includes(x.status))??response.data[0])?.id??'')}catch(reason){setError(reason instanceof ApiError?reason.message:'Não foi possível carregar os recursos técnicos.')}},[]);
  useEffect(()=>{void load()},[load]);
  return <div className="stack-lg"><ServiceOrdersPage/><ContentCard title="Equipamento, peças e histórico financeiro" description="Recursos vinculados à ordem de serviço selecionada. Orçamentos, peças, pagamentos e garantias permanecem dentro do mesmo atendimento técnico." action={orders.length?<select aria-label="Selecionar OS para recursos técnicos" value={selectedId} onChange={e=>setSelectedId(e.target.value)}><option value="">Selecione uma OS</option>{orders.map(order=><option key={order.id} value={order.id}>OS #{order.number}{order.subject?` · ${order.subject}`:''}{order.customer_name?` · ${order.customer_name}`:''}</option>)}</select>:undefined}>{error?<div className="auth-notice error" role="alert">{error}</div>:null}{selectedId?<ServiceOrderResourcesPanel serviceOrderId={selectedId} onChanged={()=>void load(true)}/>:<p>Abra ou selecione uma ordem de serviço para acessar os recursos técnicos.</p>}</ContentCard></div>;
}
