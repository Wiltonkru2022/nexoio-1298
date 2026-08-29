import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { businessMemberships, businesses, memberInvitations, roles, users } from '@nexoio/db';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const teamRoutes=new Hono<ApiEnv>();
const id=z.uuid();
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const parseSender=(value:string)=>{const match=value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);return match?{name:match[1]||'Nexoio',email:match[2]!.trim()}:{name:'Nexoio',email:value.trim()}};

async function sendInviteEmail(c:any,email:string,acceptUrl:string,businessName:string){
  if(!c.env.BREVO_API_KEY||!c.env.EMAIL_FROM)return false;
  const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{accept:'application/json','api-key':c.env.BREVO_API_KEY,'content-type':'application/json'},body:JSON.stringify({sender:parseSender(c.env.EMAIL_FROM),to:[{email}],subject:`Convite para ${businessName} na Nexoio`,htmlContent:`<p>Você foi convidado para acessar <strong>${businessName}</strong> na Nexoio.</p><p><a href="${acceptUrl}">Aceitar convite</a></p><p>O convite expira em 7 dias.</p>`})});
  if(!response.ok){console.error(JSON.stringify({event:'team.invite_email_failed',status:response.status,email}));return false}return true;
}

teamRoutes.get('/team',requirePermission('team.read'),async c=>{
  const businessId=c.get('auth').businessId;
  const data=await c.get('db').select({membershipId:businessMemberships.id,userId:users.id,name:users.name,email:users.email,phone:users.phone,status:businessMemberships.status,roleId:roles.id,roleCode:roles.code,roleName:roles.name,acceptedAt:businessMemberships.acceptedAt,createdAt:businessMemberships.createdAt}).from(businessMemberships).innerJoin(users,eq(users.id,businessMemberships.userId)).innerJoin(roles,eq(roles.id,businessMemberships.roleId)).where(eq(businessMemberships.businessId,businessId)).orderBy(desc(businessMemberships.createdAt));
  return c.json({data});
});

teamRoutes.get('/team/roles',requirePermission('team.read'),async c=>{
  const data=await c.get('db').select({id:roles.id,code:roles.code,name:roles.name,isSystem:roles.isSystem}).from(roles).where(eq(roles.businessId,c.get('auth').businessId));
  return c.json({data});
});

teamRoutes.get('/team/invitations',requirePermission('team.read'),async c=>{
  const data=await c.get('db').select({id:memberInvitations.id,email:memberInvitations.email,roleId:memberInvitations.roleId,status:memberInvitations.status,expiresAt:memberInvitations.expiresAt,createdAt:memberInvitations.createdAt,roleName:roles.name}).from(memberInvitations).innerJoin(roles,eq(roles.id,memberInvitations.roleId)).where(eq(memberInvitations.businessId,c.get('auth').businessId)).orderBy(desc(memberInvitations.createdAt));
  return c.json({data});
});

teamRoutes.post('/team/invitations',requirePermission('team.invite'),async c=>{
  const body=z.object({email:z.email(),roleId:id}).safeParse(await c.req.json().catch(()=>null));if(!body.success)return error(c,422,'VALIDATION_ERROR','Convite inválido',body.error.flatten());
  const businessId=c.get('auth').businessId,db=c.get('db');const role=(await db.select({id:roles.id,code:roles.code}).from(roles).where(and(eq(roles.id,body.data.roleId),eq(roles.businessId,businessId))).limit(1))[0];if(!role)return error(c,404,'ROLE_NOT_FOUND','Função não encontrada');if(role.code==='owner')return error(c,403,'OWNER_ROLE_RESERVED','A função Proprietário não pode ser atribuída por convite');
  const normalized=body.data.email.toLowerCase();const existing=(await db.select({id:memberInvitations.id,expiresAt:memberInvitations.expiresAt}).from(memberInvitations).where(and(eq(memberInvitations.businessId,businessId),eq(memberInvitations.email,normalized),eq(memberInvitations.status,'pending'))).limit(1))[0];if(existing&&existing.expiresAt>new Date())return error(c,409,'INVITATION_PENDING','Já existe um convite pendente para este e-mail');if(existing)await db.update(memberInvitations).set({status:'expired'}).where(eq(memberInvitations.id,existing.id));
  const token=crypto.randomUUID()+crypto.randomUUID(),invitationId=uuidv7();await db.insert(memberInvitations).values({id:invitationId,businessId,email:normalized,roleId:body.data.roleId,tokenHash:await digest(token),invitedBy:c.get('auth').userId,expiresAt:new Date(Date.now()+7*86400000)});
  const business=(await db.select({name:businesses.displayName}).from(businesses).where(eq(businesses.id,businessId)).limit(1))[0];const acceptUrl=`${c.env.APP_URL}/aceitar-convite?token=${encodeURIComponent(token)}`;const delivered=await sendInviteEmail(c,normalized,acceptUrl,business?.name??'sua empresa');
  return c.json({data:{id:invitationId,email:normalized,acceptUrl,delivered,expiresAt:new Date(Date.now()+7*86400000).toISOString()}},201);
});

teamRoutes.patch('/team/:membershipId/role',requirePermission('team.update'),async c=>{
  const membershipId=id.safeParse(c.req.param('membershipId'));const body=z.object({roleId:id}).safeParse(await c.req.json().catch(()=>null));if(!membershipId.success||!body.success)return error(c,422,'VALIDATION_ERROR','Alteração inválida');const businessId=c.get('auth').businessId,db=c.get('db');
  const current=(await db.select({id:businessMemberships.id,roleCode:roles.code}).from(businessMemberships).innerJoin(roles,eq(roles.id,businessMemberships.roleId)).where(and(eq(businessMemberships.id,membershipId.data),eq(businessMemberships.businessId,businessId))).limit(1))[0];if(!current)return error(c,404,'MEMBER_NOT_FOUND','Membro não encontrado');if(current.roleCode==='owner')return error(c,403,'OWNER_PROTECTED','O proprietário não pode ter a função alterada por esta tela');const role=(await db.select({id:roles.id,code:roles.code}).from(roles).where(and(eq(roles.id,body.data.roleId),eq(roles.businessId,businessId))).limit(1))[0];if(!role)return error(c,404,'ROLE_NOT_FOUND','Função não encontrada');if(role.code==='owner')return error(c,403,'OWNER_ROLE_RESERVED','A função Proprietário é reservada');await db.update(businessMemberships).set({roleId:body.data.roleId,updatedAt:new Date()}).where(eq(businessMemberships.id,membershipId.data));return c.json({data:{membershipId:membershipId.data,roleId:body.data.roleId}});
});

teamRoutes.delete('/team/:membershipId',requirePermission('team.remove'),async c=>{
  const membershipId=id.safeParse(c.req.param('membershipId'));if(!membershipId.success)return error(c,422,'VALIDATION_ERROR','Membro inválido');const businessId=c.get('auth').businessId,db=c.get('db');const current=(await db.select({id:businessMemberships.id,roleCode:roles.code,userId:businessMemberships.userId}).from(businessMemberships).innerJoin(roles,eq(roles.id,businessMemberships.roleId)).where(and(eq(businessMemberships.id,membershipId.data),eq(businessMemberships.businessId,businessId))).limit(1))[0];if(!current)return error(c,404,'MEMBER_NOT_FOUND','Membro não encontrado');if(current.roleCode==='owner')return error(c,403,'OWNER_PROTECTED','O proprietário não pode ser removido');if(current.userId===c.get('auth').userId)return error(c,409,'CANNOT_REMOVE_SELF','Você não pode remover seu próprio acesso por esta tela');await db.update(businessMemberships).set({status:'removed',updatedAt:new Date()}).where(eq(businessMemberships.id,membershipId.data));return c.json({data:{membershipId:membershipId.data,status:'removed'}});
});
