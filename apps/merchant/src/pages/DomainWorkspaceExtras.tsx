import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, Pill } from '@nexoio/ui';
import { useSession } from '../auth/SessionProvider';
import { ContentCard } from '../components/ContentCard';
import { Field, Modal } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { ClinicWorkspacePage } from './ClinicWorkspacePage';
import { GymWorkspacePage } from './GymWorkspacePage';

type Notice={id:string;title:string;message:string;audience:string;status?:string;published_at?:string|null};
type Insurance={id:string;name:string;code?:string|null;rules?:string|null;active?:boolean};

function NoticesPanel(){
  const session=useSession();
  const enabled=session.modules.has('notices');
  const canWrite=session.permissions.has('team.update')||session.permissions.has('customers.update');
  const[items,setItems]=useState<Notice[]>([]);const[loading,setLoading]=useState(true);const[open,setOpen]=useState(false);const[saving,setSaving]=useState(false);const[error,setError]=useState('');const[notice,setNotice]=useState('');
  const load=useCallback(async(force=false)=>{if(!enabled){setLoading(false);return}setLoading(true);setError('');try{const result=await api.get<{data:Notice[]}>('/api/v1/notices',{force});setItems(result.data)}catch(reason){setError(reason instanceof ApiError?reason.message:'Não foi possível carregar os avisos.')}finally{setLoading(false)}},[enabled]);
  useEffect(()=>{void load()},[load]);
  if(!enabled)return null;
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);setSaving(true);setError('');try{await api.post('/api/v1/notices',{title:String(form.get('title')??'').trim(),message:String(form.get('message')??'').trim(),audience:String(form.get('audience')??'all'),publish:form.get('publish')==='true'});setOpen(false);setNotice('Aviso salvo.');await load(true)}catch(reason){setError(reason instanceof ApiError?reason.message:'Não foi possível salvar o aviso.')}finally{setSaving(false)}};
  return <><ContentCard title="Avisos e comunicação" description="Comunicados para alunos, equipe ou todos sem criar um módulo separado." action={canWrite?<Button onClick={()=>setOpen(true)}>Novo aviso</Button>:undefined}>{error?<div className="auth-notice error" role="alert">{error}</div>:null}{notice?<div className="auth-notice success" role="status">{notice}</div>:null}{loading?<div className="empty-state"><h3>Carregando avisos…</h3></div>:items.length?<div className="table-shell"><table><thead><tr><th>Título</th><th>Público</th><th>Status</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong>{item.title}</strong><br/><small>{item.message}</small></td><td>{item.audience==='students'?'Alunos':item.audience==='team'?'Equipe':'Todos'}</td><td><Pill tone={item.status==='published'?'success':'warning'}>{item.status||'rascunho'}</Pill></td></tr>)}</tbody></table></div>:<EmptyState title="Nenhum aviso" description="Crie comunicados quando precisar falar com alunos ou equipe."/>}</ContentCard><Modal open={open} onClose={()=>!saving&&setOpen(false)} onSubmit={submit} title="Novo aviso" submitLabel={saving?'Salvando…':'Salvar aviso'}><Field label="Título" name="title" required/><Field label="Mensagem" name="message" required><textarea name="message" required rows={4}/></Field><Field label="Público" name="audience"><select name="audience" defaultValue="all"><option value="all">Todos</option><option value="students">Alunos</option><option value="team">Equipe</option></select></Field><Field label="Publicação" name="publish"><select name="publish" defaultValue="true"><option value="true">Publicar agora</option><option value="false">Salvar como rascunho</option></select></Field></Modal></>;
}

function InsurancePanel(){
  const session=useSession();
  const enabled=session.modules.has('insurance');
  const canWrite=session.permissions.has('patients.write')||session.permissions.has('patients.update')||session.permissions.has('patients.sensitive.read');
  const[items,setItems]=useState<Insurance[]>([]);const[loading,setLoading]=useState(true);const[open,setOpen]=useState(false);const[saving,setSaving]=useState(false);const[error,setError]=useState('');const[notice,setNotice]=useState('');
  const load=useCallback(async(force=false)=>{if(!enabled){setLoading(false);return}setLoading(true);setError('');try{const result=await api.get<{data:Insurance[]}>('/api/v1/insurance',{force});setItems(result.data)}catch(reason){setError(reason instanceof ApiError?reason.message:'Não foi possível carregar os convênios.')}finally{setLoading(false)}},[enabled]);
  useEffect(()=>{void load()},[load]);
  if(!enabled)return null;
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);setSaving(true);setError('');try{await api.post('/api/v1/insurance',{name:String(form.get('name')??'').trim(),code:String(form.get('code')??'').trim()||undefined,rules:String(form.get('rules')??'').trim()||undefined});setOpen(false);setNotice('Convênio cadastrado.');await load(true)}catch(reason){setError(reason instanceof ApiError?reason.message:'Não foi possível cadastrar o convênio.')}finally{setSaving(false)}};
  return <><ContentCard title="Convênios" description="Regras de atendimento e identificação de convênios ficam dentro da Clínica." action={canWrite?<Button onClick={()=>setOpen(true)}>Novo convênio</Button>:undefined}>{error?<div className="auth-notice error" role="alert">{error}</div>:null}{notice?<div className="auth-notice success" role="status">{notice}</div>:null}{loading?<div className="empty-state"><h3>Carregando convênios…</h3></div>:items.length?<div className="table-shell"><table><thead><tr><th>Convênio</th><th>Código</th><th>Regras</th><th>Status</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.code||'—'}</td><td>{item.rules||'—'}</td><td><Pill tone={item.active===false?'warning':'success'}>{item.active===false?'Inativo':'Ativo'}</Pill></td></tr>)}</tbody></table></div>:<EmptyState title="Nenhum convênio" description="Cadastre convênios quando a clínica trabalhar com regras específicas de atendimento."/>}</ContentCard><Modal open={open} onClose={()=>!saving&&setOpen(false)} onSubmit={submit} title="Novo convênio" submitLabel={saving?'Salvando…':'Cadastrar convênio'}><Field label="Nome" name="name" required/><Field label="Código" name="code"/><Field label="Regras / observações" name="rules"><textarea name="rules" rows={4}/></Field></Modal></>;
}

export function ClinicWorkspaceWithInsurancePage(){return <><ClinicWorkspacePage/><InsurancePanel/></>}
export function GymWorkspaceWithNoticesPage(){return <><GymWorkspacePage/><NoticesPanel/></>}
