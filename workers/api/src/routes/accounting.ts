import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const accountingRoutes=new Hono<ApiEnv>();
const rows=(result:any)=>result?.rows??result??[];
const id=z.uuid();

accountingRoutes.get('/finance/accounting-periods',requirePermission('finance.read'),async c=>{
  const result=await c.get('db').execute(sql`select * from accounting_periods where business_id=${c.get('auth').businessId}::uuid order by starts_on desc`);
  return c.json({data:rows(result)});
});

accountingRoutes.post('/finance/accounting-periods',requirePermission('finance.create'),async c=>{
  const parsed=z.object({startsOn:z.iso.date(),endsOn:z.iso.date(),notes:z.string().max(2000).nullish()}).safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success||parsed.data.endsOn<parsed.data.startsOn)return error(c,422,'VALIDATION_ERROR','Período contábil inválido');
  const overlap=rows(await c.get('db').execute(sql`select id from accounting_periods where business_id=${c.get('auth').businessId}::uuid and daterange(starts_on,ends_on,'[]') && daterange(${parsed.data.startsOn}::date,${parsed.data.endsOn}::date,'[]') limit 1`));
  if(overlap.length)return error(c,409,'ACCOUNTING_PERIOD_OVERLAP','Já existe período contábil sobreposto');
  const periodId=uuidv7();
  await c.get('db').execute(sql`insert into accounting_periods(id,business_id,starts_on,ends_on,notes) values(${periodId},${c.get('auth').businessId}::uuid,${parsed.data.startsOn}::date,${parsed.data.endsOn}::date,${parsed.data.notes??null})`);
  return c.json({data:{id:periodId,...parsed.data,status:'open'}},201);
});

accountingRoutes.post('/finance/accounting-periods/:periodId/close',requirePermission('finance.create'),async c=>{
  const periodId=id.safeParse(c.req.param('periodId'));if(!periodId.success)return error(c,422,'VALIDATION_ERROR','Período inválido');
  const before=rows(await c.get('db').execute(sql`select * from accounting_periods where id=${periodId.data}::uuid and business_id=${c.get('auth').businessId}::uuid limit 1`))[0] as any;
  if(!before)return error(c,404,'NOT_FOUND','Período contábil não encontrado');if(before.status==='closed')return error(c,409,'ACCOUNTING_PERIOD_CLOSED','Período já está fechado');
  const pending=rows(await c.get('db').execute(sql`select count(*)::int total from financial_ledger where business_id=${c.get('auth').businessId}::uuid and competence_date between ${before.starts_on}::date and ${before.ends_on}::date and status not in ('posted','reversed')`))[0] as any;
  if(Number(pending?.total??0)>0)return error(c,409,'ACCOUNTING_PENDING_ENTRIES','Existem lançamentos pendentes no período',{total:Number(pending.total)});
  const result=rows(await c.get('db').execute(sql`update accounting_periods set status='closed',closed_by=${c.get('auth').userId}::uuid,closed_at=now() where id=${periodId.data}::uuid and business_id=${c.get('auth').businessId}::uuid and status='open' returning *`))[0];
  await c.get('db').execute(sql`insert into audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,request_id,before_json,after_json) values(${uuidv7()},${c.get('auth').businessId}::uuid,${c.get('auth').userId}::uuid,'accounting.period.closed','accounting_period',${periodId.data}::uuid,${c.get('requestId')},${JSON.stringify(before)}::jsonb,${JSON.stringify(result)}::jsonb)`);
  return c.json({data:result});
});

accountingRoutes.post('/finance/accounting-periods/:periodId/reopen',requirePermission('settings.update'),async c=>{
  const periodId=id.safeParse(c.req.param('periodId'));const parsed=z.object({reason:z.string().trim().min(5).max(1000)}).safeParse(await c.req.json().catch(()=>null));
  if(!periodId.success||!parsed.success)return error(c,422,'VALIDATION_ERROR','Reabertura inválida');
  const before=rows(await c.get('db').execute(sql`select * from accounting_periods where id=${periodId.data}::uuid and business_id=${c.get('auth').businessId}::uuid limit 1`))[0] as any;
  if(!before)return error(c,404,'NOT_FOUND','Período contábil não encontrado');if(before.status!=='closed')return error(c,409,'ACCOUNTING_PERIOD_OPEN','Período já está aberto');
  const result=rows(await c.get('db').execute(sql`update accounting_periods set status='open',closed_by=null,closed_at=null,notes=concat_ws(E'\n',notes,${`Reabertura: ${parsed.data.reason}`}) where id=${periodId.data}::uuid and business_id=${c.get('auth').businessId}::uuid returning *`))[0];
  await c.get('db').execute(sql`insert into audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,request_id,before_json,after_json) values(${uuidv7()},${c.get('auth').businessId}::uuid,${c.get('auth').userId}::uuid,'accounting.period.reopened','accounting_period',${periodId.data}::uuid,${c.get('requestId')},${JSON.stringify(before)}::jsonb,${JSON.stringify({result,reason:parsed.data.reason})}::jsonb)`);
  return c.json({data:result});
});

accountingRoutes.get('/finance/reports/dre',requirePermission('reports.read'),async c=>{
  const from=c.req.query('from')??new Date(new Date().getFullYear(),0,1).toISOString().slice(0,10);
  const to=c.req.query('to')??new Date().toISOString().slice(0,10);
  const basis=c.req.query('basis')==='cash'?'cash':'competence';
  const result=basis==='cash'
    ? await c.get('db').execute(sql`select ca.code,coalesce(ca.name,'Sem conta contábil') name,coalesce(ca.account_type,case when fl.entry_type='income' then 'revenue' else 'expense' end) account_type,coalesce(sum(case when fl.entry_type='income' then fl.amount else -fl.amount end),0) amount from financial_ledger fl left join chart_accounts ca on ca.id=fl.chart_account_id and ca.business_id=fl.business_id where fl.business_id=${c.get('auth').businessId}::uuid and fl.status='posted' and fl.cash_date between ${from}::date and ${to}::date group by ca.code,ca.name,ca.account_type,fl.entry_type order by ca.code nulls last`)
    : await c.get('db').execute(sql`select ca.code,coalesce(ca.name,'Sem conta contábil') name,coalesce(ca.account_type,case when fl.entry_type='income' then 'revenue' else 'expense' end) account_type,coalesce(sum(case when fl.entry_type='income' then fl.amount else -fl.amount end),0) amount from financial_ledger fl left join chart_accounts ca on ca.id=fl.chart_account_id and ca.business_id=fl.business_id where fl.business_id=${c.get('auth').businessId}::uuid and fl.status='posted' and fl.competence_date between ${from}::date and ${to}::date group by ca.code,ca.name,ca.account_type,fl.entry_type order by ca.code nulls last`);
  const lines=rows(result);const net=lines.reduce((sum:number,line:any)=>sum+Number(line.amount),0);
  return c.json({data:{basis,from,to,lines,net}});
});
