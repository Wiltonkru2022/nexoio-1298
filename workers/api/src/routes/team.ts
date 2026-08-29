import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { businessMemberships, businesses, memberInvitations, professionals, roles, users } from '@nexoio/db';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const teamRoutes=new Hono<ApiEnv>();
const id=z.uuid();
const rows=(result:any)=>result?.rows??result??[];
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

teamRoutes.get('/team/professionals',requirePermission('team.read'),async c=>{
  const businessId=c.get('auth').businessId;
  const data=await c.get('db').select({id:professionals.id,displayName:professionals.displayName,userId:professionals.userId,active:professionals.active,userName:users.name,userEmail:users.email}).from(professionals).leftJoin(users,eq(users.id,professionals.userId)).where(eq(professionals.businessId,businessId)).orderBy(desc(professionals.active),professionals.displayName);
  return c.json({data});
});

async function validateProfessionalUser(c:any,userId:string,professionalId?:string){
  const businessId=c.get('auth').businessId,db=c.get('db');
  const membership=(await db.select({id:businessMemberships.id}).from(businessMemberships).where(and(eq(businessMemberships.businessId,businessId),eq(businessMemberships.userId,userId),eq(businessMemberships.status,'active'))).limit(1))[0];
  if(!membership)return {ok:false as const,response:error(c,422,'MEMBER_NOT_ACTIVE','O usuário selecionado não possui acesso ativo a esta empresa')};
  const predicates=[eq(professionals.businessId,businessId),eq(professionals.userId,userId)];if(professionalId)predicates.push(ne(professionals.id,professionalId));
  const duplicate=(await db.select({id:professionals.id}).from(professionals).where(and(...predicates)).limit(1))[0];
  if(duplicate)return {ok:false as const,response:error(c,409,'PROFESSIONAL_USER_ALREADY_LINKED','Este usuário já está vinculado a outro perfil profissional')};
  return {ok:true as const};
}

teamRoutes.post('/team/professionals',requirePermission('team.update'),async c=>{
  const body=z.object({displayName:z.string().trim().min(2).max(180),userId:id.nullish()}).safeParse(await c.req.json().catch(()=>null));if(!body.success)return error(c,422,'VALIDATION_ERROR','Profissional inválido');
  if(body.data.userId){const check=await validateProfessionalUser(c,body.data.userId);if(!check.ok)return check.response;}
  const recordId=uuidv7();await c.get('db').insert(professionals).values({id:recordId,businessId:c.get('auth').businessId,userId:body.data.userId??null,displayName:body.data.displayName,active:true});
  return c.json({data:{id:recordId,displayName:body.data.displayName,userId:body.data.userId??null,active:true}},201);
});

teamRoutes.patch('/team/professionals/:professionalId',requirePermission('team.update'),async c=>{
  const professionalId=id.safeParse(c.req.param('professionalId'));const body=z.object({displayName:z.string().trim().min(2).max(180).optional(),userId:id.nullable().optional(),active:z.boolean().optional()}).refine(value=>value.displayName!==undefined||value.userId!==undefined||value.active!==undefined).safeParse(await c.req.json().catch(()=>null));if(!professionalId.success||!body.success)return error(c,422,'VALIDATION_ERROR','Alteração de profissional inválida');
  const businessId=c.get('auth').businessId,db=c.get('db');const current=(await db.select({id:professionals.id}).from(professionals).where(and(eq(professionals.id,professionalId.data),eq(professionals.businessId,businessId))).limit(1))[0];if(!current)return error(c,404,'PROFESSIONAL_NOT_FOUND','Profissional não encontrado');
  if(body.data.userId){const check=await validateProfessionalUser(c,body.data.userId,professionalId.data);if(!check.ok)return check.response;}
  await db.update(professionals).set(body.data).where(and(eq(professionals.id,professionalId.data),eq(professionals.businessId,businessId)));
  return c.json({data:{id:professionalId.data,...body.data}});
});

const commissionBody=z.object({professionalId:id.nullish(),itemType:z.enum(['product','service','all']),productId:id.nullish(),serviceId:id.nullish(),ratePercent:z.coerce.number().finite().min(0).max(100).default(0),fixedAmount:z.coerce.number().finite().nonnegative().default(0),active:z.boolean().optional()}).refine(value=>value.ratePercent>0||value.fixedAmount>0,{message:'Informe percentual ou valor fixo'});
async function validateCommissionLinks(c:any,data:{professionalId?:string|null;itemType:'product'|'service'|'all';productId?:string|null;serviceId?:string|null}){
  const businessId=c.get('auth').businessId,db=c.get('db');
  if(data.professionalId){const r=await db.execute(sql`select id from professionals where id=${data.professionalId}::uuid and business_id=${businessId}::uuid limit 1`);if(!rows(r).length)return error(c,422,'PROFESSIONAL_NOT_FOUND','Profissional não pertence a esta empresa');}
  if(data.productId){if(data.itemType!=='product')return error(c,422,'INVALID_COMMISSION_TARGET','Produto só pode ser informado em regra de produto');const r=await db.execute(sql`select id from products where id=${data.productId}::uuid and business_id=${businessId}::uuid limit 1`);if(!rows(r).length)return error(c,422,'PRODUCT_NOT_FOUND','Produto não pertence a esta empresa');}
  if(data.serviceId){if(data.itemType!=='service')return error(c,422,'INVALID_COMMISSION_TARGET','Serviço só pode ser informado em regra de serviço');const r=await db.execute(sql`select id from services where id=${data.serviceId}::uuid and business_id=${businessId}::uuid limit 1`);if(!rows(r).length)return error(c,422,'SERVICE_NOT_FOUND','Serviço não pertence a esta empresa');}
  if(data.itemType==='all'&&(data.productId||data.serviceId))return error(c,422,'INVALID_COMMISSION_TARGET','Regra geral não pode apontar produto ou serviço específico');
  return null;
}

teamRoutes.get('/commission-rules',requirePermission('finance.read'),async c=>{
  const r=await c.get('db').execute(sql`select cr.*,p.display_name professional_name,pr.name product_name,s.name service_name from commission_rules cr left join professionals p on p.id=cr.professional_id and p.business_id=cr.business_id left join products pr on pr.id=cr.product_id and pr.business_id=cr.business_id left join services s on s.id=cr.service_id and s.business_id=cr.business_id where cr.business_id=${c.get('auth').businessId}::uuid order by cr.active desc,cr.created_at desc`);
  return c.json({data:rows(r)});
});

teamRoutes.post('/commission-rules',requirePermission('finance.create'),async c=>{
  const body=commissionBody.safeParse(await c.req.json().catch(()=>null));if(!body.success)return error(c,422,'VALIDATION_ERROR','Regra de comissão inválida',body.error.flatten());
  const invalid=await validateCommissionLinks(c,body.data);if(invalid)return invalid;const recordId=uuidv7();
  await c.get('db').execute(sql`insert into commission_rules(id,business_id,professional_id,item_type,product_id,service_id,rate_percent,fixed_amount,active) values(${recordId},${c.get('auth').businessId}::uuid,${body.data.professionalId??null}::uuid,${body.data.itemType},${body.data.productId??null}::uuid,${body.data.serviceId??null}::uuid,${body.data.ratePercent},${body.data.fixedAmount},${body.data.active??true})`);
  return c.json({data:{id:recordId,...body.data,active:body.data.active??true}},201);
});

teamRoutes.patch('/commission-rules/:ruleId',requirePermission('finance.create'),async c=>{
  const ruleId=id.safeParse(c.req.param('ruleId'));if(!ruleId.success)return error(c,422,'VALIDATION_ERROR','Regra de comissão inválida');const db=c.get('db'),businessId=c.get('auth').businessId;
  const currentResult=await db.execute(sql`select professional_id,item_type,product_id,service_id,rate_percent,fixed_amount,active from commission_rules where id=${ruleId.data}::uuid and business_id=${businessId}::uuid limit 1`);const current:any=rows(currentResult)[0];if(!current)return error(c,404,'COMMISSION_RULE_NOT_FOUND','Regra de comissão não encontrada');
  const patch=z.object({professionalId:id.nullable().optional(),itemType:z.enum(['product','service','all']).optional(),productId:id.nullable().optional(),serviceId:id.nullable().optional(),ratePercent:z.coerce.number().finite().min(0).max(100).optional(),fixedAmount:z.coerce.number().finite().nonnegative().optional(),active:z.boolean().optional()}).refine(value=>Object.keys(value).length>0).safeParse(await c.req.json().catch(()=>null));if(!patch.success)return error(c,422,'VALIDATION_ERROR','Alteração de comissão inválida',patch.error.flatten());
  const next={professionalId:patch.data.professionalId!==undefined?patch.data.professionalId:current.professional_id,itemType:patch.data.itemType??current.item_type,productId:patch.data.productId!==undefined?patch.data.productId:current.product_id,serviceId:patch.data.serviceId!==undefined?patch.data.serviceId:current.service_id,ratePercent:patch.data.ratePercent!==undefined?patch.data.ratePercent:Number(current.rate_percent),fixedAmount:patch.data.fixedAmount!==undefined?patch.data.fixedAmount:Number(current.fixed_amount),active:patch.data.active!==undefined?patch.data.active:Boolean(current.active)};
  if(next.ratePercent<=0&&next.fixedAmount<=0)return error(c,422,'VALIDATION_ERROR','Informe percentual ou valor fixo');const invalid=await validateCommissionLinks(c,next);if(invalid)return invalid;
  await db.execute(sql`update commission_rules set professional_id=${next.professionalId??null}::uuid,item_type=${next.itemType},product_id=${next.productId??null}::uuid,service_id=${next.serviceId??null}::uuid,rate_percent=${next.ratePercent},fixed_amount=${next.fixedAmount},active=${next.active},updated_at=now() where id=${ruleId.data}::uuid and business_id=${businessId}::uuid`);
  return c.json({data:{id:ruleId.data,...next}});
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
