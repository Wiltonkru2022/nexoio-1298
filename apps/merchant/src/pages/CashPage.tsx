import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { Field, Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { StatGrid } from '../components/StatGrid';
import { api } from '../lib/api';

type CashMovement={id:string;movementType:string;amount:string;description:string|null;createdAt:string};
type CashData={session:null|{id:string;status:string;openingAmount:string;openedAt:string;closedAt:string|null};movements:CashMovement[];summary:{opening:number;entries:number;exits:number;balance:number}};
const brl=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const labels:Record<string,string>={sale:'Venda',supply:'Suprimento',withdrawal:'Sangria',expense:'Despesa',refund:'Estorno',out:'Saída'};

export function CashPage(){
 const [data,setData]=useState<CashData>({session:null,movements:[],summary:{opening:0,entries:0,exits:0,balance:0}}),[loading,setLoading]=useState(true),[openModal,setOpenModal]=useState(false),[moveModal,setMoveModal]=useState(false),[error,setError]=useState('');
 const load=async()=>{setLoading(true);try{setData((await api.get<{data:CashData}>('/api/v1/cash')).data);setError('')}catch(e:any){setError(e.message||'Erro ao carregar caixa')}finally{setLoading(false)}};
 useEffect(()=>{void load();const t=setInterval(()=>void load(),15000);return()=>clearInterval(t)},[]);
 const isOpen=data.session?.status==='open';
 const openCash=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api.post('/api/v1/cash/open',{openingAmount:Number(f.get('amount')||0)});setOpenModal(false);await load()}catch(x:any){setError(x.message)}};
 const movement=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api.post('/api/v1/cash/movement',{movementType:f.get('movementType'),amount:Number(f.get('amount')||0),description:f.get('description')});setMoveModal(false);await load()}catch(x:any){setError(x.message)}};
 const close=async()=>{const raw=prompt('Valor contado no caixa',String(data.summary.balance.toFixed(2)));if(raw===null)return;try{await api.post('/api/v1/cash/close',{closingAmount:Number(raw.replace(',','.'))});await load()}catch(x:any){setError(x.message)}};
 const rows=useMemo(()=>data.movements,[data.movements]);
 return <><PageHeader title="Caixa" description="Abra, acompanhe e feche o caixa com movimentações auditáveis." action={<div style={{display:'flex',gap:10}}>{isOpen?<><Button ghost onClick={()=>setMoveModal(true)}>Nova movimentação</Button><Button onClick={()=>void close()}>Fechar caixa</Button></>:<Button onClick={()=>setOpenModal(true)}>Abrir caixa</Button>}</div>}/>
 <StatGrid items={[{label:'Status',value:isOpen?'Aberto':'Fechado',tone:isOpen?'positive':'warning'},{label:'Saldo inicial',value:brl(data.summary.opening)},{label:'Entradas',value:brl(data.summary.entries)},{label:'Saídas',value:brl(data.summary.exits)}]}/>
 <ContentCard title="Sessão atual" description="Movimentos reais do caixa em operação.">{error?<div className="restaurant-error">{error}</div>:null}{loading?<p>Carregando...</p>:rows.length?<div className="table-shell"><table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>{rows.map(x=>{const out=['withdrawal','expense','refund','out'].includes(x.movementType);return <tr key={x.id}><td>{new Date(x.createdAt).toLocaleString('pt-BR')}</td><td>{x.description||labels[x.movementType]||x.movementType}</td><td><Pill tone={out?'warning':'success'}>{labels[x.movementType]||x.movementType}</Pill></td><td><strong>{out?'-':'+'} {brl(Math.abs(Number(x.amount)))}</strong></td></tr>})}</tbody></table></div>:<div className="merchant-empty"><Pill tone={isOpen?'success':'warning'}>{isOpen?'Caixa aberto':'Caixa fechado'}</Pill><h3>{isOpen?'Nenhuma movimentação nesta sessão':'Abra o caixa para começar'}</h3></div>}</ContentCard>
 <Modal open={openModal} onClose={()=>setOpenModal(false)} onSubmit={openCash} title="Abrir caixa" submitLabel="Confirmar abertura"><Field label="Saldo inicial" name="amount" type="number" required/></Modal>
 <Modal open={moveModal} onClose={()=>setMoveModal(false)} onSubmit={movement} title="Movimentação de caixa" submitLabel="Registrar"><Field label="Tipo" name="movementType"><select name="movementType" defaultValue="supply"><option value="supply">Suprimento</option><option value="withdrawal">Sangria</option><option value="expense">Despesa</option></select></Field><Field label="Valor" name="amount" type="number" required/><Field label="Descrição" name="description" required/></Modal></>;
}
