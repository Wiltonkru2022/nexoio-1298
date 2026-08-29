import { useEffect, useState } from 'react';
import { EmptyState, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { PageHeader } from '../components/PageHeader';
import { StatGrid } from '../components/StatGrid';
import { api } from '../lib/api';

type Movement={id:string;movementType:string;amount:string;description:string|null;createdAt:string};
type FinanceData={salesToday:number;revenueToday:number;entries:number;exits:number;result:number;movements:Movement[]};
const brl=(v:unknown)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const labels:Record<string,string>={sale:'Venda',supply:'Suprimento',withdrawal:'Sangria',expense:'Despesa',refund:'Estorno',out:'Saída'};
export function FinancePage(){
 const[data,setData]=useState<FinanceData>({salesToday:0,revenueToday:0,entries:0,exits:0,result:0,movements:[]}),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=async()=>{setLoading(true);try{setData((await api.get<{data:FinanceData}>('/api/v1/finance')).data);setError('')}catch(e:any){setError(e.message||'Não foi possível carregar o financeiro.')}finally{setLoading(false)}};
 useEffect(()=>{void load();const t=setInterval(()=>void load(),20000);return()=>clearInterval(t)},[]);
 return <><PageHeader title="Financeiro" description="Visão financeira baseada em vendas e movimentações reais do caixa."/><StatGrid items={[{label:'Faturamento hoje',value:brl(data.revenueToday)},{label:'Entradas',value:brl(data.entries)},{label:'Saídas',value:brl(data.exits)},{label:'Resultado operacional',value:brl(data.result),tone:data.result<0?'warning':'positive'}]}/><ContentCard title="Movimentações financeiras" description="Entradas e saídas auditáveis geradas pela operação real.">{error?<div className="restaurant-error">{error}</div>:null}{loading&&!data.movements.length?<div className="merchant-empty"><h3>Carregando financeiro…</h3></div>:data.movements.length?<div className="table-shell"><table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>{data.movements.map(x=>{const out=['withdrawal','expense','refund','out'].includes(x.movementType);return <tr key={x.id}><td>{new Date(x.createdAt).toLocaleString('pt-BR')}</td><td>{x.description||labels[x.movementType]||x.movementType}</td><td><Pill tone={out?'warning':'success'}>{labels[x.movementType]||x.movementType}</Pill></td><td><strong>{out?'-':'+'} {brl(Math.abs(Number(x.amount)))}</strong></td></tr>})}</tbody></table></div>:<EmptyState title="Nenhuma movimentação" description="As vendas, suprimentos, sangrias e despesas aparecerão aqui conforme a operação ocorrer."/>}</ContentCard></>;
}
