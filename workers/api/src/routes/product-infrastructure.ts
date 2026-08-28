import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const productInfrastructureRoutes = new Hono<ApiEnv>();
export const publicAssetRoutes = new Hono<ApiEnv>();
const rows=(result:any)=>result?.rows??result??[];
const uuid=z.uuid();

function normalizeHostname(value:string){return value.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');}
function validHostname(value:string){return /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)&&!value.endsWith('.nexoio.com.br')&&value!=='nexoio.com.br';}
async function cf(c:any,path:string,init:RequestInit={}){
  if(!c.env.CLOUDFLARE_API_TOKEN||!c.env.CLOUDFLARE_ZONE_ID)return {ok:false,status:503,data:null,error:'Cloudflare for SaaS não configurado'};
  const response=await fetch(`https://api.cloudflare.com/client/v4/zones/${c.env.CLOUDFLARE_ZONE_ID}${path}`,{...init,headers:{Authorization:`Bearer ${c.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json',...(init.headers??{})}});
  const json:any=await response.json().catch(()=>null);return {ok:response.ok&&json?.success!==false,status:response.status,data:json?.result,error:json?.errors?.[0]?.message??response.statusText};
}

productInfrastructureRoutes.get('/domains',requirePermission('public_site.read'),async c=>{
  const result=await c.get('db').execute(sql`select id,hostname,verification_status,ssl_status,dns_target,validation_json,created_at,updated_at from business_domains where business_id=${c.get('auth').businessId}::uuid order by created_at desc`);
  return c.json({data:rows(result)});
});

productInfrastructureRoutes.post('/domains',requirePermission('public_site.update'),async c=>{
  const parsed=z.object({hostname:z.string().min(4).max(253)}).strict().safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return error(c,422,'VALIDATION_ERROR','Domínio inválido');
  const hostname=normalizeHostname(parsed.data.hostname);if(!validHostname(hostname))return error(c,422,'VALIDATION_ERROR','Informe um domínio ou subdomínio válido fora de nexoio.com.br');
  const existing=await c.get('db').execute(sql`select id,business_id from business_domains where hostname=${hostname} limit 1`);const old:any=rows(existing)[0];if(old&&old.business_id!==c.get('auth').businessId)return error(c,409,'DOMAIN_IN_USE','Este domínio já está associado a outra empresa');if(old)return error(c,409,'DOMAIN_EXISTS','Este domínio já foi cadastrado');
  const created=await cf(c,'/custom_hostnames',{method:'POST',body:JSON.stringify({hostname,ssl:{method:'txt',type:'dv'}})});if(!created.ok)return error(c,created.status===503?503:502,'DOMAIN_PROVIDER_ERROR',created.error||'Não foi possível cadastrar o domínio');
  const provider:any=created.data;const id=uuidv7();const validation={ownership:provider?.ownership_verification??null,ssl:provider?.ssl?.validation_records??[],providerStatus:provider?.status??'pending'};
  await c.get('db').execute(sql`insert into business_domains(id,business_id,hostname,verification_status,ssl_status,provider,provider_hostname_id,dns_target,validation_json) values(${id},${c.get('auth').businessId}::uuid,${hostname},'pending',${provider?.ssl?.status??'pending'},'cloudflare',${provider?.id??null},${c.env.SAAS_CNAME_TARGET??null},${JSON.stringify(validation)}::jsonb)`);
  return c.json({data:{id,hostname,status:'pending',sslStatus:provider?.ssl?.status??'pending',dnsTarget:c.env.SAAS_CNAME_TARGET??null,validation}},201);
});

productInfrastructureRoutes.post('/domains/:id/refresh',requirePermission('public_site.update'),async c=>{
  const domainId=uuid.safeParse(c.req.param('id'));if(!domainId.success)return error(c,422,'VALIDATION_ERROR','Domínio inválido');
  const found=await c.get('db').execute(sql`select id,hostname,provider_hostname_id from business_domains where id=${domainId.data}::uuid and business_id=${c.get('auth').businessId}::uuid limit 1`);const domain:any=rows(found)[0];if(!domain)return error(c,404,'NOT_FOUND','Domínio não encontrado');if(!domain.provider_hostname_id)return error(c,409,'DOMAIN_PROVIDER_NOT_LINKED','Domínio sem vínculo com o provedor');
  const detail=await cf(c,`/custom_hostnames/${encodeURIComponent(domain.provider_hostname_id)}`);if(!detail.ok)return error(c,502,'DOMAIN_PROVIDER_ERROR',detail.error||'Falha ao consultar domínio');const provider:any=detail.data;
  const hostActive=provider?.status==='active';const sslActive=provider?.ssl?.status==='active';const verificationStatus=hostActive&&sslActive?'verified':provider?.status??'pending';const validation={ownership:provider?.ownership_verification??null,ownershipHttp:provider?.ownership_verification_http??null,ssl:provider?.ssl?.validation_records??[],providerStatus:provider?.status??null};
  await c.get('db').execute(sql`update business_domains set verification_status=${verificationStatus},ssl_status=${provider?.ssl?.status??'pending'},validation_json=${JSON.stringify(validation)}::jsonb,updated_at=now() where id=${domainId.data}::uuid and business_id=${c.get('auth').businessId}::uuid`);
  return c.json({data:{id:domainId.data,hostname:domain.hostname,verificationStatus,sslStatus:provider?.ssl?.status??'pending',ready:hostActive&&sslActive,dnsTarget:c.env.SAAS_CNAME_TARGET??null,validation}});
});

productInfrastructureRoutes.delete('/domains/:id',requirePermission('public_site.update'),async c=>{
  const domainId=uuid.safeParse(c.req.param('id'));if(!domainId.success)return error(c,422,'VALIDATION_ERROR','Domínio inválido');const found=await c.get('db').execute(sql`select provider_hostname_id from business_domains where id=${domainId.data}::uuid and business_id=${c.get('auth').businessId}::uuid limit 1`);const domain:any=rows(found)[0];if(!domain)return error(c,404,'NOT_FOUND','Domínio não encontrado');if(domain.provider_hostname_id){const removed=await cf(c,`/custom_hostnames/${encodeURIComponent(domain.provider_hostname_id)}`,{method:'DELETE'});if(!removed.ok&&removed.status!==404)return error(c,502,'DOMAIN_PROVIDER_ERROR',removed.error||'Falha ao remover domínio');}
  await c.get('db').execute(sql`delete from business_domains where id=${domainId.data}::uuid and business_id=${c.get('auth').businessId}::uuid`);return c.json({data:{id:domainId.data,deleted:true}});
});

const allowedTypes=new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif','application/pdf']);
const MAX_FILE_BYTES=10*1024*1024;
productInfrastructureRoutes.post('/media',requirePermission('public_site.update'),async c=>{
  const form=await c.req.formData().catch(()=>null);const file=form?.get('file');if(!(file instanceof File))return error(c,422,'VALIDATION_ERROR','Arquivo obrigatório');if(file.size<=0||file.size>MAX_FILE_BYTES)return error(c,413,'FILE_TOO_LARGE','Arquivo deve ter no máximo 10 MB');if(!allowedTypes.has(file.type))return error(c,415,'UNSUPPORTED_MEDIA_TYPE','Tipo de arquivo não permitido');
  const purpose=String(form?.get('purpose')??'general').slice(0,80);const visibility=String(form?.get('visibility')??'private')==='public'?'public':'private';const businessId=c.get('auth').businessId;
  const quotaResult=await c.get('db').execute(sql`select coalesce(sum(size_bytes),0) used from files where business_id=${businessId}::uuid and deleted_at is null`);const used=Number((rows(quotaResult)[0] as any)?.used??0);const configured=await c.get('db').execute(sql`select storage_limit_bytes from business_quotas where business_id=${businessId}::uuid limit 1`);const limit=Number((rows(configured)[0] as any)?.storage_limit_bytes??100*1024*1024);if(used+file.size>limit)return error(c,409,'STORAGE_QUOTA_EXCEEDED','Limite de armazenamento da empresa atingido',{usedBytes:used,limitBytes:limit});
  const fileId=uuidv7();const ext=(file.name.split('.').pop()??'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||'bin';const objectKey=`businesses/${businessId}/${purpose}/${fileId}.${ext}`;const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());const checksum=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
  await c.env.R2_BUCKET.put(objectKey,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{businessId,fileId,purpose}});
  try{await c.get('db').execute(sql`insert into files(id,business_id,bucket,object_key,original_name,mime_type,size_bytes,checksum_sha256,visibility,uploaded_by,purpose) values(${fileId},${businessId}::uuid,'r2',${objectKey},${file.name.slice(0,255)},${file.type},${file.size},${checksum},${visibility},${c.get('auth').userId}::uuid,${purpose})`);}catch(e){await c.env.R2_BUCKET.delete(objectKey);throw e;}
  return c.json({data:{id:fileId,name:file.name,mimeType:file.type,sizeBytes:file.size,visibility,purpose,url:visibility==='public'?`${new URL(c.req.url).origin}/api/public/media/${fileId}`:`${new URL(c.req.url).origin}/api/v1/media/${fileId}/content`}},201);
});

productInfrastructureRoutes.get('/media',requirePermission('public_site.read'),async c=>{const result=await c.get('db').execute(sql`select id,original_name,mime_type,size_bytes,visibility,purpose,created_at from files where business_id=${c.get('auth').businessId}::uuid and deleted_at is null order by created_at desc limit 200`);return c.json({data:rows(result)});});
productInfrastructureRoutes.get('/media/:id/content',requirePermission('public_site.read'),async c=>{const fileId=uuid.safeParse(c.req.param('id'));if(!fileId.success)return error(c,422,'VALIDATION_ERROR','Arquivo inválido');const result=await c.get('db').execute(sql`select object_key,mime_type,original_name from files where id=${fileId.data}::uuid and business_id=${c.get('auth').businessId}::uuid and deleted_at is null limit 1`);const meta:any=rows(result)[0];if(!meta)return error(c,404,'NOT_FOUND','Arquivo não encontrado');const object=await c.env.R2_BUCKET.get(meta.object_key);if(!object)return error(c,404,'NOT_FOUND','Objeto não encontrado');return new Response(object.body,{headers:{'content-type':meta.mime_type??object.httpMetadata?.contentType??'application/octet-stream','cache-control':'private, max-age=60','content-disposition':`inline; filename*=UTF-8''${encodeURIComponent(meta.original_name??'arquivo')}`}});});
productInfrastructureRoutes.delete('/media/:id',requirePermission('public_site.update'),async c=>{const fileId=uuid.safeParse(c.req.param('id'));if(!fileId.success)return error(c,422,'VALIDATION_ERROR','Arquivo inválido');const result=await c.get('db').execute(sql`select object_key,size_bytes from files where id=${fileId.data}::uuid and business_id=${c.get('auth').businessId}::uuid and deleted_at is null limit 1`);const meta:any=rows(result)[0];if(!meta)return error(c,404,'NOT_FOUND','Arquivo não encontrado');await c.env.R2_BUCKET.delete(meta.object_key);await c.get('db').execute(sql`update files set deleted_at=now() where id=${fileId.data}::uuid and business_id=${c.get('auth').businessId}::uuid`);return c.json({data:{id:fileId.data,deleted:true}});});

publicAssetRoutes.get('/:id',async c=>{const fileId=uuid.safeParse(c.req.param('id'));if(!fileId.success)return c.notFound();const result=await c.get('db').execute(sql`select object_key,mime_type from files where id=${fileId.data}::uuid and visibility='public' and deleted_at is null limit 1`);const meta:any=rows(result)[0];if(!meta)return c.notFound();const object=await c.env.R2_BUCKET.get(meta.object_key);if(!object)return c.notFound();return new Response(object.body,{headers:{'content-type':meta.mime_type??object.httpMetadata?.contentType??'application/octet-stream','cache-control':'public, max-age=3600, s-maxage=86400','x-content-type-options':'nosniff'}});});

productInfrastructureRoutes.get('/notifications',async c=>{const result=await c.get('db').execute(sql`select id,event_code,channel,template,payload,status,sent_at,read_at,created_at from notifications where business_id=${c.get('auth').businessId}::uuid and (user_id is null or user_id=${c.get('auth').userId}::uuid) order by created_at desc limit 100`);return c.json({data:rows(result)});});
productInfrastructureRoutes.patch('/notifications/:id/read',async c=>{const notificationId=uuid.safeParse(c.req.param('id'));if(!notificationId.success)return error(c,422,'VALIDATION_ERROR','Notificação inválida');const updated=await c.get('db').execute(sql`update notifications set read_at=coalesce(read_at,now()) where id=${notificationId.data}::uuid and business_id=${c.get('auth').businessId}::uuid and (user_id is null or user_id=${c.get('auth').userId}::uuid) returning id,read_at`);if(!rows(updated).length)return error(c,404,'NOT_FOUND','Notificação não encontrada');return c.json({data:rows(updated)[0]});});

productInfrastructureRoutes.get('/subscription',requirePermission('settings.read'),async c=>{const result=await c.get('db').execute(sql`select s.*,p.code plan_code,p.name plan_name,p.price_monthly,coalesce((select jsonb_agg(jsonb_build_object('feature',pf.feature_code,'enabled',pf.enabled,'limit',pf.limit_value)) from plan_features pf where pf.plan_id=p.id),'[]'::jsonb) features,coalesce((select jsonb_agg(jsonb_build_object('id',si.id,'amount',si.amount,'status',si.status,'dueDate',si.due_date,'paidAt',si.paid_at,'invoiceUrl',si.invoice_url) order by si.created_at desc) from subscription_invoices si where si.subscription_id=s.id),'[]'::jsonb) invoices from subscriptions s join plans p on p.id=s.plan_id where s.business_id=${c.get('auth').businessId}::uuid limit 1`);return c.json({data:rows(result)[0]??null});});
