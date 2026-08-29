import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const restaurantFlowRoutes=new Hono<ApiEnv>();
const rows=(r:any)=>r?.rows??r??[];const id=z.uuid();
const modeSchema=z.enum(['automatic','manual','table_only']);

restaurantFlowRoutes.get('/restaurant/settings',requirePermission('orders.read'),async c=>{
  const b=c.get('auth').businessId;
  const result=await c.get('db').execute(sql`select command_mode,updated_at from restaurant_settings where business_id=${b}::uuid limit 1`);
  return c.json({data:rows(result)[0]??{command_mode:'automatic'}});
});

restaurantFlowRoutes.patch('/restaurant/settings',requirePermission('settings.update'),async c=>{
  const body=z.object({commandMode:modeSchema}).safeParse(await c.req.json().catch(()=>null));
  if(!body.success)return error(c,422,'VALIDATION_ERROR','Configuração de restaurante inválida');
  const b=c.get('auth').businessId,u=c.get('auth').userId;
  await c.get('db').execute(sql`insert into restaurant_settings(business_id,command_mode,updated_by,updated_at)
    values(${b}::uuid,${body.data.commandMode},${u}::uuid,now())
    on conflict(business_id) do update set command_mode=excluded.command_mode,updated_by=excluded.updated_by,updated_at=now()`);
  await c.get('db').execute(sql`insert into audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,request_id,after_json)
    values(${uuidv7()},${b}::uuid,${u}::uuid,'restaurant.settings.updated','business',${b}::uuid,${c.get('requestId')},${JSON.stringify(body.data)}::jsonb)`);
  return c.json({data:{command_mode:body.data.commandMode}});
});

restaurantFlowRoutes.post('/restaurant/tables/:tableId/open',requirePermission('orders.write'),async c=>{
  const tableId=id.safeParse(c.req.param('tableId'));const body=z.object({commandCode:z.string().trim().min(1).max(80).nullish(),guestCount:z.coerce.number().int().min(1).max(100).default(1),customerId:id.nullish()}).safeParse(await c.req.json().catch(()=>({})));
  if(!tableId.success||!body.success)return error(c,422,'VALIDATION_ERROR','Atendimento inválido');
  const b=c.get('auth').businessId,u=c.get('auth').userId,db=c.get('db');
  const table=rows(await db.execute(sql`select id,unit_id,number,status from restaurant_tables where id=${tableId.data}::uuid and business_id=${b}::uuid limit 1`))[0] as any;
  if(!table)return error(c,404,'TABLE_NOT_FOUND','Mesa não encontrada');
  if(table.status==='unavailable')return error(c,409,'TABLE_UNAVAILABLE','Mesa indisponível');
  const setting=rows(await db.execute(sql`select command_mode from restaurant_settings where business_id=${b}::uuid limit 1`))[0] as any;
  const mode=modeSchema.catch('automatic').parse(setting?.command_mode??'automatic');

  if(mode==='table_only'){
    await db.execute(sql`update restaurant_tables set status='occupied' where id=${tableId.data}::uuid and business_id=${b}::uuid`);
    return c.json({data:{mode,tableId:tableId.data,tableNumber:table.number,tabId:null,commandCode:null}});
  }

  const existing=rows(await db.execute(sql`select id,code,guest_count from order_tabs where business_id=${b}::uuid and table_id=${tableId.data}::uuid and status='open' order by opened_at desc limit 1`))[0] as any;
  if(existing){
    await db.execute(sql`update restaurant_tables set status='occupied' where id=${tableId.data}::uuid and business_id=${b}::uuid`);
    return c.json({data:{mode,tableId:tableId.data,tableNumber:table.number,tabId:existing.id,commandCode:existing.code,guestCount:existing.guest_count,reused:true}});
  }

  let commandCode=body.data.commandCode?.trim()??null;
  if(mode==='manual'&&!commandCode)return error(c,422,'COMMAND_CODE_REQUIRED','Informe o número/código da comanda usada pelo restaurante');
  if(mode==='automatic')commandCode=`MESA ${table.number}`;
  const sameCode=rows(await db.execute(sql`select id,table_id from order_tabs where business_id=${b}::uuid and code=${commandCode} and status='open' limit 1`))[0] as any;
  if(sameCode)return error(c,409,'COMMAND_ALREADY_OPEN','Essa comanda já está aberta em outro atendimento');
  const tabId=uuidv7();
  await db.execute(sql`insert into order_tabs(id,business_id,unit_id,table_id,customer_id,code,guest_count,status,opened_by,opened_at)
    values(${tabId},${b}::uuid,${table.unit_id??null}::uuid,${tableId.data}::uuid,${body.data.customerId??null}::uuid,${commandCode},${body.data.guestCount},'open',${u}::uuid,now())`);
  await db.execute(sql`update restaurant_tables set status='occupied' where id=${tableId.data}::uuid and business_id=${b}::uuid`);
  return c.json({data:{mode,tableId:tableId.data,tableNumber:table.number,tabId,commandCode,guestCount:body.data.guestCount,reused:false}},201);
});

restaurantFlowRoutes.get('/restaurant/checks',requirePermission('orders.read'),async c=>{
  const b=c.get('auth').businessId;
  const result=await c.get('db').execute(sql`
    select t.id,t.code,t.table_id,rt.number table_number,t.customer_id,c.name customer_name,t.guest_count,t.status,t.opened_at,
      coalesce(sum(o.total) filter(where o.status not in ('cancelled')),0) total,
      coalesce(sum(op.paid),0) paid,
      greatest(coalesce(sum(o.total) filter(where o.status not in ('cancelled')),0)-coalesce(sum(op.paid),0),0) due,
      count(o.id) filter(where o.status not in ('closed','cancelled')) open_orders
    from order_tabs t
    left join restaurant_tables rt on rt.id=t.table_id and rt.business_id=t.business_id
    left join customers c on c.id=t.customer_id and c.business_id=t.business_id
    left join orders o on o.tab_id=t.id and o.business_id=t.business_id
    left join lateral (select coalesce(sum(p.amount) filter(where p.status='paid'),0) paid from order_payments p where p.business_id=t.business_id and p.order_id=o.id) op on true
    where t.business_id=${b}::uuid and t.status='open'
    group by t.id,rt.number,c.name order by t.opened_at asc`);
  return c.json({data:rows(result)});
});

restaurantFlowRoutes.get('/restaurant/accounts',requirePermission('orders.read'),async c=>{
  const b=c.get('auth').businessId;
  const result=await c.get('db').execute(sql`
    with command_accounts as (
      select 'command'::text account_type,t.id account_id,t.code label,t.table_id,rt.number table_number,t.opened_at,
        coalesce(sum(o.total) filter(where o.status not in ('cancelled')),0) total,
        coalesce(sum(op.paid),0) paid,
        greatest(coalesce(sum(o.total) filter(where o.status not in ('cancelled')),0)-coalesce(sum(op.paid),0),0) due
      from order_tabs t
      left join restaurant_tables rt on rt.id=t.table_id and rt.business_id=t.business_id
      left join orders o on o.tab_id=t.id and o.business_id=t.business_id
      left join lateral (select coalesce(sum(p.amount) filter(where p.status='paid'),0) paid from order_payments p where p.business_id=t.business_id and p.order_id=o.id) op on true
      where t.business_id=${b}::uuid and t.status='open'
      group by t.id,rt.number
    ), table_accounts as (
      select 'table'::text account_type,rt.id account_id,('Mesa '||rt.number)::text label,rt.id table_id,rt.number table_number,min(o.opened_at) opened_at,
        coalesce(sum(o.total),0) total,coalesce(sum(op.paid),0) paid,
        greatest(coalesce(sum(o.total),0)-coalesce(sum(op.paid),0),0) due
      from restaurant_tables rt
      join orders o on o.table_id=rt.id and o.business_id=rt.business_id and o.tab_id is null and o.status not in ('closed','cancelled')
      left join lateral (select coalesce(sum(p.amount) filter(where p.status='paid'),0) paid from order_payments p where p.business_id=rt.business_id and p.order_id=o.id) op on true
      where rt.business_id=${b}::uuid
      group by rt.id,rt.number
    )
    select * from command_accounts where due>0
    union all
    select * from table_accounts where due>0
    order by opened_at asc`);
  return c.json({data:rows(result)});
});

restaurantFlowRoutes.post('/restaurant/commands/:tabId/pay',requirePermission('sales.create'),async c=>{
  const tabId=id.safeParse(c.req.param('tabId'));const body=z.object({method:z.string().trim().min(1).max(40),amount:z.coerce.number().positive()}).safeParse(await c.req.json().catch(()=>null));
  if(!tabId.success||!body.success)return error(c,422,'VALIDATION_ERROR','Pagamento inválido');
  try{
    const result=await c.get('db').execute(sql`select * from pay_restaurant_tab_transactional(${c.get('auth').businessId}::uuid,${tabId.data}::uuid,${c.get('auth').userId}::uuid,${body.data.method},${body.data.amount})`);
    return c.json({data:rows(result)[0]});
  }catch(reason){const message=reason instanceof Error?reason.message:String(reason);if(message.includes('TAB_NOT_FOUND'))return error(c,404,'TAB_NOT_FOUND','Comanda não encontrada ou já fechada');if(message.includes('TAB_HAS_NO_BALANCE'))return error(c,409,'TAB_HAS_NO_BALANCE','A comanda não possui saldo em aberto');if(message.includes('AMOUNT_EXCEEDS_BALANCE'))return error(c,409,'AMOUNT_EXCEEDS_BALANCE','Pagamento maior que o saldo da comanda');if(message.includes('INVENTORY_LOCATION_REQUIRED'))return error(c,409,'INVENTORY_LOCATION_REQUIRED','Configure um local de estoque antes de fechar a conta');if(message.includes('INSUFFICIENT_STOCK'))return error(c,409,'INSUFFICIENT_STOCK','Estoque insuficiente para fechar a conta');throw reason;}
});

restaurantFlowRoutes.post('/restaurant/tables/:tableId/pay',requirePermission('sales.create'),async c=>{
  const tableId=id.safeParse(c.req.param('tableId'));const body=z.object({method:z.string().trim().min(1).max(40),amount:z.coerce.number().positive()}).safeParse(await c.req.json().catch(()=>null));
  if(!tableId.success||!body.success)return error(c,422,'VALIDATION_ERROR','Pagamento inválido');
  try{
    const result=await c.get('db').execute(sql`select * from pay_restaurant_table_transactional(${c.get('auth').businessId}::uuid,${tableId.data}::uuid,${c.get('auth').userId}::uuid,${body.data.method},${body.data.amount})`);
    return c.json({data:rows(result)[0]});
  }catch(reason){const message=reason instanceof Error?reason.message:String(reason);if(message.includes('TABLE_NOT_FOUND'))return error(c,404,'TABLE_NOT_FOUND','Mesa não encontrada');if(message.includes('TABLE_HAS_NO_BALANCE'))return error(c,409,'TABLE_HAS_NO_BALANCE','A mesa não possui saldo em aberto');if(message.includes('AMOUNT_EXCEEDS_BALANCE'))return error(c,409,'AMOUNT_EXCEEDS_BALANCE','Pagamento maior que o saldo da mesa');if(message.includes('INVENTORY_LOCATION_REQUIRED'))return error(c,409,'INVENTORY_LOCATION_REQUIRED','Configure um local de estoque antes de fechar a conta');if(message.includes('INSUFFICIENT_STOCK'))return error(c,409,'INSUFFICIENT_STOCK','Estoque insuficiente para fechar a conta');throw reason;}
});
