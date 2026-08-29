import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api';
import { Field, Modal } from '../components/Modal';
import './team.css';

type Member={id:string;userId:string;name:string;email:string|null;roleId:string;roleCode:string;roleName:string;permissions:string[];isCurrentUser:boolean};
type Invite={id:string;email:string;roleId:string;roleName:string;roleCode:string;status:string;createdAt:string;expiresAt:string};
type Role={id:string;code:string;name:string;permissions:string[]};
type TeamData={members:Member[];invitations:Invite[]};

const groupLabel=(permission:string)=>{
  if(permission.startsWith('cash.'))return 'Caixa';
  if(permission.startsWith('orders.'))return 'Pedidos';
  if(permission.startsWith('inventory.'))return 'Estoque';
  if(permission.startsWith('finance.'))return 'Financeiro';
  if(permission.startsWith('appointments.'))return 'Agenda';
  if(permission.startsWith('customers.'))return 'Clientes';
  if(permission.startsWith('products.'))return 'Produtos';
  if(permission.startsWith('sales.'))return 'Vendas';
  if(permission.startsWith('team.'))return 'Equipe';
  if(permission.startsWith('settings.'))return 'Configurações';
  if(permission.startsWith('public_site.'))return 'Página pública';
  return permission.split('.')[0] || permission;
};
const permissionText=(permissions:string[])=>{
  const groups=[...new Set(permissions.map(groupLabel))];
  return groups.length>=9?'Total':groups.slice(0,4).join(', ')+(groups.length>4?'…':'');
};
const roleDisplay=(code:string,name:string)=>code==='owner'?'Dono (Admin)':code==='admin'?'Administrador':code==='professional'?'Profissional':name;
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'U';

export function TeamPage(){
  const [data,setData]=useState<TeamData>({members:[],invitations:[]});
  const [roles,setRoles]=useState<Role[]>([]);
  const [loading,setLoading]=useState(true);
  const [inviteOpen,setInviteOpen]=useState(false);
  const [edit,setEdit]=useState<Member|null>(null);
  const [view,setView]=useState<Member|null>(null);
  const [error,setError]=useState('');
  const [inviteLink,setInviteLink]=useState('');
  const load=async()=>{setLoading(true);setError('');try{const[a,b]=await Promise.all([api.get<{data:TeamData}>('/api/v1/team'),api.get<{data:Role[]}>('/api/v1/team/roles')]);setData(a.data);setRoles(b.data)}catch(e:any){setError(e.message||'Não foi possível carregar a equipe.')}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const stats=useMemo(()=>({
    active:data.members.length,
    professionals:data.members.filter(x=>x.roleCode==='professional').length,
    admins:data.members.filter(x=>x.roleCode==='admin'||x.roleCode==='owner').length,
    pending:data.invitations.length
  }),[data]);
  const invite=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const r=await api.post<{data:{id:string;acceptUrl:string}}>('/api/v1/platform/business/invitations',{email:String(f.get('email')||''),roleId:String(f.get('roleId')||'')});setInviteLink(r.data.acceptUrl);setInviteOpen(false);await load()}catch(x:any){setError(x.message||'Não foi possível enviar o convite.')}};
  const saveRole=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!edit)return;const f=new FormData(e.currentTarget);try{await api.patch(`/api/v1/team/members/${edit.id}/role`,{roleId:String(f.get('roleId')||'')});setEdit(null);await load()}catch(x:any){setError(x.message||'Não foi possível alterar o acesso.')}};
  const remove=async(member:Member)=>{if(!confirm(`Remover ${member.name} da equipe?`))return;try{await api.delete(`/api/v1/team/members/${member.id}`);await load()}catch(x:any){setError(x.message||'Não foi possível remover a pessoa.')}};
  const cancelInvite=async(invite:Invite)=>{if(!confirm(`Cancelar convite de ${invite.email}?`))return;try{await api.delete(`/api/v1/team/invitations/${invite.id}`);await load()}catch(x:any){setError(x.message||'Não foi possível cancelar o convite.')}};
  const copyInvite=async()=>{if(!inviteLink)return;await navigator.clipboard.writeText(inviteLink);alert('Link do convite copiado.');};

  return <>
    <div className="team-head"><div><small>NEXOIO</small><h1>Equipe</h1><p>Gerencie profissionais, permissões, agenda e acessos.</p></div><button className="team-primary" onClick={()=>setInviteOpen(true)}>Adicionar pessoa</button></div>
    <div className="team-stats">
      <div><span>Membros ativos</span><strong>{stats.active}</strong></div>
      <div><span>Profissionais</span><strong>{stats.professionals}</strong></div>
      <div><span>Administradores</span><strong>{stats.admins}</strong></div>
      <div><span>Convites pendentes</span><strong>{stats.pending}</strong></div>
    </div>
    <section className="team-panel">
      <h2>Pessoas e acessos</h2><p>Controle quem pode acessar cada área.</p>
      {error?<div className="team-error">{error}</div>:null}
      {inviteLink?<div className="team-invite-link"><div><b>Convite criado</b><span>O acesso só é liberado quando a pessoa entra pelo link e aceita o convite.</span></div><button onClick={()=>void copyInvite()}>Copiar link</button></div>:null}
      <div className="team-table-wrap"><table className="team-table"><thead><tr><th>Nome</th><th>Função</th><th>Email</th><th>Permissões</th><th>Ações</th></tr></thead><tbody>
        {data.members.map(member=><tr key={member.id}><td><div className="team-person"><span className="team-avatar">{initials(member.name)}</span><strong>{member.name}{member.isCurrentUser?' (Você)':''}</strong></div></td><td>{roleDisplay(member.roleCode,member.roleName)}</td><td>{member.email||'—'}</td><td>{permissionText(member.permissions)}</td><td><div className="team-actions"><button title="Configurar acesso" onClick={()=>setEdit(member)}>⚙</button><button title="Visualizar" onClick={()=>setView(member)}>◉</button>{!member.isCurrentUser?<button className="danger" title="Remover" onClick={()=>void remove(member)}>×</button>:null}</div></td></tr>)}
        {data.invitations.map(inv=><tr key={inv.id} className="team-pending"><td><div className="team-person"><span className="team-avatar pending">✉</span><strong>{inv.email}</strong></div></td><td>{roleDisplay(inv.roleCode,inv.roleName)}</td><td>{inv.email}</td><td><span className="team-pill">Convite pendente</span></td><td><div className="team-actions"><button className="danger" title="Cancelar convite" onClick={()=>void cancelInvite(inv)}>×</button></div></td></tr>)}
      </tbody></table></div>
      {loading?<div className="team-empty">Carregando equipe…</div>:!data.members.length&&!data.invitations.length?<div className="team-empty">Nenhuma pessoa cadastrada.</div>:null}
    </section>

    <Modal open={inviteOpen} title="Adicionar pessoa" description="Crie um convite real com a função e permissões definidas para esta empresa." submitLabel="Criar convite" onClose={()=>setInviteOpen(false)} onSubmit={invite}><Field label="E-mail" name="email" type="email" required/><Field label="Função" name="roleId"><select name="roleId" required defaultValue=""><option value="" disabled>Selecione</option>{roles.filter(r=>r.code!=='owner').map(r=><option key={r.id} value={r.id}>{roleDisplay(r.code,r.name)}</option>)}</select></Field></Modal>
    <Modal open={Boolean(edit)} title={`Acesso de ${edit?.name??''}`} description="A função controla as permissões reais desta pessoa." submitLabel="Salvar acesso" onClose={()=>setEdit(null)} onSubmit={saveRole}><Field label="Função" name="roleId"><select name="roleId" defaultValue={edit?.roleId}>{roles.map(r=><option key={r.id} value={r.id}>{roleDisplay(r.code,r.name)}</option>)}</select></Field>{edit?<div className="team-permission-preview"><b>Permissões atuais</b><p>{edit.permissions.length?edit.permissions.map(groupLabel).filter((x,i,a)=>a.indexOf(x)===i).join(', '):'Nenhuma permissão.'}</p></div>:null}</Modal>
    {view?<div className="team-detail-overlay" onMouseDown={e=>e.currentTarget===e.target&&setView(null)}><aside className="team-detail"><button onClick={()=>setView(null)}>×</button><span className="team-avatar big">{initials(view.name)}</span><h2>{view.name}</h2><p>{view.email||'Sem e-mail'}</p><strong>{roleDisplay(view.roleCode,view.roleName)}</strong><h3>Permissões</h3><div className="team-permissions">{[...new Set(view.permissions.map(groupLabel))].map(p=><span key={p}>✓ {p}</span>)}</div></aside></div>:null}
  </>;
}
