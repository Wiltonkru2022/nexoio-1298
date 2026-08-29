import { useEffect, useMemo, useState } from 'react';
import { Button, Pill } from '@nexoio/ui';
import { ContentCard } from '../components/ContentCard';
import { PageHeader } from '../components/PageHeader';
import { api, ApiError } from '../lib/api';
import { useSession } from '../auth/SessionProvider';
import { BusinessSettingsPage } from './BusinessSettingsPage';
import { SettingsPage } from './SettingsPage';

type Tab='business'|'hours'|'system';
type HourRow={id?:string;weekday:number;opens_at?:string|null;closes_at?:string|null;break_starts_at?:string|null;break_ends_at?:string|null;closed:boolean};
const days=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const blank=(weekday:number):HourRow=>({weekday,opens_at:'08:00',closes_at:'18:00',break_starts_at:null,break_ends_at:null,closed:weekday===0});
const time=(value?:string|null)=>value?String(value).slice(0,5):'';

function BusinessHoursSection(){
 const{permissions}=useSession();const[rows,setRows]=useState<HourRow[]>(Array.from({length:7},(_,i)=>blank(i)));const[loading,setLoading]=useState(true);const[saving,setSaving]=useState<number|null>(null);const[message,setMessage]=useState('');const canWrite=permissions.has('settings.update');
 useEffect(()=>{api.get<{data:HourRow[]}>('/api/v1/business-hours').then(result=>{const byDay=new Map(result.data.map(row=>[Number(row.weekday),row]));setRows(Array.from({length:7},(_,i)=>({...blank(i),...(byDay.get(i)??{}),weekday:i}))) }).catch(reason=>setMessage(reason instanceof ApiError?reason.message:'Não foi possível carregar os horários.')).finally(()=>setLoading(false))},[]);
 const update=(weekday:number,patch:Partial<HourRow>)=>setRows(current=>current.map(row=>row.weekday===weekday?{...row,...patch}:row));
 const save=async(row:HourRow)=>{setSaving(row.weekday);setMessage('');try{await api.put(`/api/v1/business-hours/${row.weekday}`,{opensAt:row.closed?null:time(row.opens_at)||null,closesAt:row.closed?null:time(row.closes_at)||null,breakStartsAt:row.closed?null:time(row.break_starts_at)||null,breakEndsAt:row.closed?null:time(row.break_ends_at)||null,closed:row.closed});setMessage(`${days[row.weekday]} atualizado.`)}catch(reason){setMessage(reason instanceof ApiError?reason.message:'Não foi possível salvar o horário.')}finally{setSaving(null)}};
 return <><ContentCard title="Horários de funcionamento" description="Fonte única para agenda, disponibilidade e informações públicas. Configure cada dia; não use mais texto livre para o horário operacional.">{loading?<div className="empty-state"><h3>Carregando horários…</h3></div>:<div className="table-shell"><table><thead><tr><th>Dia</th><th>Abertura</th><th>Fechamento</th><th>Intervalo</th><th>Status</th><th>Ação</th></tr></thead><tbody>{rows.map(row=><tr key={row.weekday}><td><strong>{days[row.weekday]}</strong></td><td><input type="time" value={time(row.opens_at)} disabled={row.closed||!canWrite} onChange={e=>update(row.weekday,{opens_at:e.target.value})}/></td><td><input type="time" value={time(row.closes_at)} disabled={row.closed||!canWrite} onChange={e=>update(row.weekday,{closes_at:e.target.value})}/></td><td><div className="row-actions"><input aria-label={`Início do intervalo de ${days[row.weekday]}`} type="time" value={time(row.break_starts_at)} disabled={row.closed||!canWrite} onChange={e=>update(row.weekday,{break_starts_at:e.target.value||null})}/><input aria-label={`Fim do intervalo de ${days[row.weekday]}`} type="time" value={time(row.break_ends_at)} disabled={row.closed||!canWrite} onChange={e=>update(row.weekday,{break_ends_at:e.target.value||null})}/></div></td><td>{canWrite?<label className="menu-stock-toggle"><input type="checkbox" checked={row.closed} onChange={e=>update(row.weekday,{closed:e.target.checked})}/><span>{row.closed?'Fechado':'Aberto'}</span></label>:<Pill tone={row.closed?'warning':'success'}>{row.closed?'Fechado':'Aberto'}</Pill>}</td><td>{canWrite?<Button onClick={()=>void save(row)} disabled={saving===row.weekday}>{saving===row.weekday?'Salvando…':'Salvar'}</Button>:null}</td></tr>)}</tbody></table></div>}</ContentCard>{message?<div className="toast" role="status">{message}</div>:null}</>;
}

export function ConfigurationWorkspacePage(){
 const initial=useMemo<Tab>(()=>location.pathname==='/dados-empresa'?'business':location.pathname==='/horarios'?'hours':'system',[]);const[tab,setTab]=useState<Tab>(initial);
 const select=(next:Tab)=>{setTab(next);if(location.pathname!=='/configuracoes')history.replaceState({},'','/configuracoes')};
 return <><PageHeader title="Configurações" description="Empresa, horários, operação, assinatura e segurança em um único lugar."/><div className="row-actions" role="tablist" aria-label="Seções de configurações"><button type="button" aria-pressed={tab==='business'} onClick={()=>select('business')}>Empresa</button><button type="button" aria-pressed={tab==='hours'} onClick={()=>select('hours')}>Horários</button><button type="button" aria-pressed={tab==='system'} onClick={()=>select('system')}>Sistema e segurança</button></div>{tab==='business'?<BusinessSettingsPage embedded/>:tab==='hours'?<BusinessHoursSection/>:<SettingsPage embedded/>}</>;
}
