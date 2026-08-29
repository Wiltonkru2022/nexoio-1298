import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const restaurantPrintAgentAdminRoutes=new Hono<ApiEnv>();
export const restaurantPrintAgentRoutes=new Hono<ApiEnv>();
const rows=(r:any)=>r?.rows??r??[];
const id=z.uuid();

const hashToken=async(token:string)=>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
};
const newToken=()=>{const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};

restaurantPrintAgentAdminRoutes.get('/restaurant/print-agents',requirePermission('settings.read'),async c=>{
  const result=await c.get('db').execute(sql`select id,name,active,last_seen_at,created_at,revoked_at from restaurant_print_agents where business_id=${c.get('auth').businessId}::uuid order by active desc,created_at desc`);
  return c.json({data:rows(result)});
});

restaurantPrintAgentAdminRoutes.post('/restaurant/print-agents',requirePermission('settings.update'),async c=>{
  const body=z.object({name:z.string().trim().min(2).max(120)}).safeParse(await c.req.json().catch(()=>null));if(!body.success)return error(c,422,'VALIDATION_ERROR','Agente inválido');
  const token=newToken(),tokenHash=await hashToken(token),agentId=uuidv7();
  await c.get('db').execute(sql`insert into restaurant_print_agents(id,business_id,name,token_hash,created_by) values(${agentId},${c.get('auth').businessId}::uuid,${body.data.name},${tokenHash},${c.get('auth').userId}::uuid)`);
  return c.json({data:{id:agentId,name:body.data.name,token}},201);
});

restaurantPrintAgentAdminRoutes.delete('/restaurant/print-agents/:agentId',requirePermission('settings.update'),async c=>{
  const agentId=id.safeParse(c.req.param('agentId'));if(!agentId.success)return error(c,422,'VALIDATION_ERROR','Agente inválido');
  const result=await c.get('db').execute(sql`update restaurant_print_agents set active=false,revoked_at=now() where id=${agentId.data}::uuid and business_id=${c.get('auth').businessId}::uuid and active=true returning id`);if(!rows(result).length)return error(c,404,'NOT_FOUND','Agente não encontrado ou já revogado');return c.json({data:{id:agentId.data,active:false}});
});

async function authenticateAgent(c:any){
  const auth=c.req.header('authorization')??'';if(!auth.toLowerCase().startsWith('bearer '))return null;const token=auth.slice(7).trim();if(token.length<20)return null;const tokenHash=await hashToken(token);
  const agent=rows(await c.get('db').execute(sql`select id,business_id,name from restaurant_print_agents where token_hash=${tokenHash} and active=true limit 1`))[0] as any;
  if(agent)await c.get('db').execute(sql`update restaurant_print_agents set last_seen_at=now() where id=${agent.id}::uuid`);return agent??null;
}

restaurantPrintAgentRoutes.post('/jobs/claim',async c=>{
  const agent=await authenticateAgent(c);if(!agent)return error(c,401,'PRINT_AGENT_UNAUTHORIZED','Agente de impressão não autorizado');
  const body=z.object({limit:z.coerce.number().int().min(1).max(20).default(10)}).safeParse(await c.req.json().catch(()=>({})));if(!body.success)return error(c,422,'VALIDATION_ERROR','Solicitação inválida');
  const result=await c.get('db').execute(sql`with candidates as (
    select id from print_jobs where business_id=${agent.business_id}::uuid and status in ('pending','failed') and attempts<5 order by created_at asc limit ${body.data.limit} for update skip locked
  ) update print_jobs p set status='processing',attempts=p.attempts+1,last_error=null from candidates cnd where p.id=cnd.id returning p.id,p.order_id,p.kitchen_ticket_id,p.station_id,p.job_type,p.printer_key,p.payload,p.attempts,p.created_at`);
  return c.json({data:rows(result),agent:{id:agent.id,name:agent.name}});
});

restaurantPrintAgentRoutes.post('/jobs/:jobId/complete',async c=>{
  const agent=await authenticateAgent(c);if(!agent)return error(c,401,'PRINT_AGENT_UNAUTHORIZED','Agente de impressão não autorizado');const jobId=id.safeParse(c.req.param('jobId'));const body=z.object({status:z.enum(['printed','failed']),error:z.string().max(2000).nullish()}).safeParse(await c.req.json().catch(()=>null));if(!jobId.success||!body.success)return error(c,422,'VALIDATION_ERROR','Retorno de impressão inválido');
  const result=await c.get('db').execute(sql`update print_jobs set status=${body.data.status},printed_at=case when ${body.data.status}='printed' then now() else printed_at end,last_error=${body.data.status==='failed'?(body.data.error??'Falha no agente'):null} where id=${jobId.data}::uuid and business_id=${agent.business_id}::uuid and status='processing' returning id,status,attempts`);if(!rows(result).length)return error(c,404,'PRINT_JOB_NOT_FOUND','Trabalho de impressão não encontrado ou não está em processamento');return c.json({data:rows(result)[0]});
});

restaurantPrintAgentRoutes.get('/health',async c=>{const agent=await authenticateAgent(c);if(!agent)return error(c,401,'PRINT_AGENT_UNAUTHORIZED','Agente de impressão não autorizado');return c.json({status:'ready',agent:{id:agent.id,name:agent.name}});});
