import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, EmptyState, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { Field, Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { StatGrid } from '../components/StatGrid';
import { api } from '../lib/api';

type Service={id:string;name:string;description:string|null;price:string;durationMinutes:number|null;active:boolean};
export function ServicesPage(){
 const[items,setItems]=useState<Service[]>([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=async()=>{setLoading(true);try{setItems((await api.get<{data:Service[]}>('/api/v1/services')).data);setError('')}catch(e:any){setError(e.message||'Não foi possível carregar os serviços.')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const create=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api.post('/api/v1/services',{name:String(f.get('name')||''),description:String(f.get('description')||'')||undefined,price:Number(f.get('price')||0),durationMinutes:f.get('durationMinutes')?Number(f.get('durationMinutes')):undefined});setOpen(false);await load()}catch(x:any){setError(x.message||'Não foi possível cadastrar o serviço.')}};
 const active=items.filter(x=>x.active),average=active.length?active.reduce((s,x)=>s+Number(x.price),0)/active.length:0;
 return <><PageHeader title="Serviços" description="Catálogo real para vendas e agendamentos." action={<Button onClick={()=>setOpen(true)}>Novo serviço</Button>}/><StatGrid items={[{label:'Serviços ativos',value:String(active.length)},{label:'Total cadastrado',value:String(items.length)},{label:'Com duração',value:String(items.filter(x=>x.durationMinutes).length)},{label:'Preço médio',value:average.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}]}/><ContentCard title="Catálogo de serviços" description="Serviços disponíveis no banco da empresa." action={<Pill tone="brand">Catálogo real</Pill>}>{error?<div className="restaurant-error">{error}</div>:null}{loading&&!items.length?<div className="merchant-empty"><h3>Carregando serviços…</h3></div>:items.length?<div className="public-cards">{items.map(x=><article className="service-card" key={x.id}><Pill tone={x.active?'success':'warning'}>{x.active?'Ativo':'Inativo'}</Pill><h3>{x.name}</h3><p>{x.description||'Sem descrição'}{x.durationMinutes?` · ${x.durationMinutes} min`:''}</p><div className="service-price">{Number(x.price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div></article>)}</div>:<div className="catalog-grid"><EmptyState title="Nenhum serviço cadastrado" description="Cadastre serviços com preço e duração reais." action={<Button onClick={()=>setOpen(true)}>Novo serviço</Button>}/></div>}</ContentCard><Modal open={open} onClose={()=>setOpen(false)} onSubmit={create} title="Novo serviço" submitLabel="Cadastrar serviço"><Field label="Nome" name="name" required/><Field label="Descrição" name="description"/><Field label="Preço" name="price" type="number" required/><Field label="Duração (minutos)" name="durationMinutes" type="number"/></Modal></>;
}
