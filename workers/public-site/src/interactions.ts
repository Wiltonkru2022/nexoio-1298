import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { businessDomains, businesses, createDb, services } from '@nexoio/db';

type Env={Bindings:{DATABASE_URL:string}};
export const publicInteractionRoutes=new Hono<Env>();
const reserved=new Set(['nexoio.com.br','www.nexoio.com.br','app.nexoio.com.br','admin.nexoio.com.br','api.nexoio.com.br','app-staging.nexoio.com.br','admin-staging.nexoio.com.br','api-staging.nexoio.com.br']);
const rows=(r:any)=>r?.rows??r??[];

async function businessForRequest(c:any){
  const host=new URL(c.req.url).hostname.toLowerCase();if(reserved.has(host))return null;const db=createDb(c.env.DATABASE_URL);
  if(host.endsWith('.nexoio.com.br')){const label=host.slice(0,-'.nexoio.com.br'.length);const slug=label.endsWith('-staging')?label.slice(0,-8):label;if(!/^[a-z0-9-]+$/.test(slug))return null;return (await db.select({id:businesses.id}).from(businesses).where(and(eq(businesses.publicSlug,slug),eq(businesses.status,'active'))).limit(1))[0]?.id??null;}
  return (await db.select({id:businessDomains.businessId}).from(businessDomains).where(and(eq(businessDomains.hostname,host),eq(businessDomains.verificationStatus,'verified'))).limit(1))[0]?.id??null;
}
function jsonError(c:any,status:number,code:string,message:string){return c.json({error:{code,message}},status as any)}

publicInteractionRoutes.post('/lead',async c=>{
  const businessId=await businessForRequest(c);if(!businessId)return jsonError(c,404,'SITE_NOT_FOUND','Site não encontrado');
  const parsed=z.object({name:z.string().trim().min(2).max(160),email:z.union([z.email(),z.literal('')]).optional(),phone:z.string().trim().max(40).optional(),message:z.string().trim().max(3000).optional(),source:z.string().trim().max(80).default('website'),pagePath:z.string().max(500).optional()}).strict().safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return jsonError(c,422,'VALIDATION_ERROR','Dados inválidos');if(!parsed.data.email&&!parsed.data.phone)return jsonError(c,422,'CONTACT_REQUIRED','Informe telefone ou e-mail');
  const db=createDb(c.env.DATABASE_URL);const leadId=crypto.randomUUID();
  await db.execute(sql`insert into public_site_leads(id,business_id,source,name,email,phone,message,metadata_json) values(${leadId}::uuid,${businessId}::uuid,${parsed.data.source},${parsed.data.name},${parsed.data.email||null},${parsed.data.phone||null},${parsed.data.message||null},${JSON.stringify({pagePath:parsed.data.pagePath??null})}::jsonb)`);
  await db.execute(sql`insert into notifications(id,business_id,event_code,channel,template,payload,status,created_at) select ${crypto.randomUUID()}::uuid,${businessId}::uuid,'site.lead.created','internal','site_lead',${JSON.stringify({leadId,name:parsed.data.name,phone:parsed.data.phone??null,email:parsed.data.email??null})}::jsonb,'queued',now() where coalesce((select lead_notifications_enabled from public_site_integrations where business_id=${businessId}::uuid),true)=true`);
  return c.json({data:{id:leadId,status:'received'}},201);
});

publicInteractionRoutes.post('/booking',async c=>{
  const businessId=await businessForRequest(c);if(!businessId)return jsonError(c,404,'SITE_NOT_FOUND','Site não encontrado');
  const parsed=z.object({name:z.string().trim().min(2).max(160),phone:z.string().trim().min(8).max(40),email:z.union([z.email(),z.literal('')]).optional(),serviceId:z.uuid(),professionalId:z.uuid().nullish(),startsAt:z.iso.datetime(),notes:z.string().max(2000).optional()}).strict().safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return jsonError(c,422,'VALIDATION_ERROR','Agendamento inválido');const startsAt=new Date(parsed.data.startsAt);if(startsAt.getTime()<Date.now()+5*60_000)return jsonError(c,409,'INVALID_TIME','Escolha um horário futuro');
  const db=createDb(c.env.DATABASE_URL);const service=(await db.select({id:services.id,duration:services.durationMinutes}).from(services).where(and(eq(services.id,parsed.data.serviceId),eq(services.businessId,businessId),eq(services.active,true))).limit(1))[0];if(!service)return jsonError(c,404,'SERVICE_NOT_FOUND','Serviço não encontrado');
  const duration=Math.max(5,service.duration??60);const endsAt=new Date(startsAt.getTime()+duration*60_000);
  if(parsed.data.professionalId){const valid=await db.execute(sql`select 1 from professionals p where p.id=${parsed.data.professionalId}::uuid and p.business_id=${businessId}::uuid and p.active=true and exists(select 1 from professional_services ps where ps.business_id=p.business_id and ps.professional_id=p.id and ps.service_id=${parsed.data.serviceId}::uuid) limit 1`);if(!rows(valid).length)return jsonError(c,409,'PROFESSIONAL_UNAVAILABLE','Profissional indisponível para este serviço');const conflict=await db.execute(sql`select 1 from appointments where business_id=${businessId}::uuid and professional_id=${parsed.data.professionalId}::uuid and status not in ('cancelled','no_show') and starts_at < ${endsAt} and ends_at > ${startsAt} limit 1`);if(rows(conflict).length)return jsonError(c,409,'TIME_UNAVAILABLE','Horário indisponível');}
  const existing=await db.execute(sql`select id from customers where business_id=${businessId}::uuid and (phone=${parsed.data.phone} or (${parsed.data.email||null}::text is not null and lower(email)=lower(${parsed.data.email||null}))) order by created_at asc limit 1`);let customerId=(rows(existing)[0] as any)?.id as string|undefined;if(!customerId){customerId=crypto.randomUUID();await db.execute(sql`insert into customers(id,business_id,name,phone,email,status) values(${customerId}::uuid,${businessId}::uuid,${parsed.data.name},${parsed.data.phone},${parsed.data.email||null},'active')`);}
  const setting=await db.execute(sql`select booking_auto_confirm from public_site_integrations where business_id=${businessId}::uuid limit 1`);const autoConfirm=Boolean((rows(setting)[0] as any)?.booking_auto_confirm);const requestId=crypto.randomUUID();let appointmentId:string|null=null;
  if(autoConfirm){appointmentId=crypto.randomUUID();await db.execute(sql`insert into appointments(id,business_id,customer_id,professional_id,service_id,starts_at,ends_at,status,notes) values(${appointmentId}::uuid,${businessId}::uuid,${customerId}::uuid,${parsed.data.professionalId??null}::uuid,${parsed.data.serviceId}::uuid,${startsAt},${endsAt},'confirmed',${parsed.data.notes??'Agendado pelo site'})`);}
  await db.execute(sql`insert into public_booking_requests(id,business_id,customer_id,service_id,professional_id,requested_start,requested_end,status,notes,appointment_id) values(${requestId}::uuid,${businessId}::uuid,${customerId}::uuid,${parsed.data.serviceId}::uuid,${parsed.data.professionalId??null}::uuid,${startsAt},${endsAt},${autoConfirm?'confirmed':'pending'},${parsed.data.notes??null},${appointmentId}::uuid)`);
  await db.execute(sql`insert into notifications(id,business_id,event_code,channel,template,payload,status,created_at) values(${crypto.randomUUID()}::uuid,${businessId}::uuid,'site.booking.created','internal','site_booking',${JSON.stringify({requestId,appointmentId,customerId,startsAt:startsAt.toISOString()})}::jsonb,'queued',now())`);
  return c.json({data:{id:requestId,status:autoConfirm?'confirmed':'pending',appointmentId}},201);
});

publicInteractionRoutes.post('/event',async c=>{
  const businessId=await businessForRequest(c);if(!businessId)return c.body(null,204);const parsed=z.object({event:z.string().trim().min(1).max(80),pagePath:z.string().max(500).optional(),metadata:z.record(z.string(),z.unknown()).optional()}).safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.body(null,204);
  const fingerprint=`${c.req.header('cf-connecting-ip')??''}|${c.req.header('user-agent')??''}`;const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint));const visitorHash=[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');const db=createDb(c.env.DATABASE_URL);
  await db.execute(sql`insert into public_site_events(id,business_id,event_name,page_path,visitor_hash,metadata_json) values(${crypto.randomUUID()}::uuid,${businessId}::uuid,${parsed.data.event},${parsed.data.pagePath??null},${visitorHash},${JSON.stringify(parsed.data.metadata??{})}::jsonb)`);return c.body(null,204);
});
