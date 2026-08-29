import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const restaurantProductionRoutes=new Hono<ApiEnv>();
const rows=(r:any)=>r?.rows??r??[];
const id=z.uuid();
const stationType=z.enum(['kitchen','bar','fryer','grill','dessert','assembly','other']);

restaurantProductionRoutes.get('/restaurant/production/stations',requirePermission('orders.read'),async c=>{
  const result=await c.get('db').execute(sql`select id,unit_id,code,name,station_type,printer_key,auto_print,active,sort_order,created_at,updated_at from restaurant_production_stations where business_id=${c.get('auth').businessId}::uuid order by active desc,sort_order,name`);
  return c.json({data:rows(result)});
});

restaurantProductionRoutes.post('/restaurant/production/stations',requirePermission('settings.update'),async c=>{
  const body=z.object({name:z.string().trim().min(2).max(120),code:z.string().trim().min(1).max(60),stationType:stationType.default('kitchen'),printerKey:z.string().trim().max(160).nullish(),autoPrint:z.boolean().default(false),sortOrder:z.coerce.number().int().min(0).max(999).default(0),unitId:id.nullish()}).safeParse(await c.req.json().catch(()=>null));
  if(!body.success)return error(c,422,'VALIDATION_ERROR','Estação inválida',body.error.flatten());
  const stationId=uuidv7();
  try{await c.get('db').execute(sql`insert into restaurant_production_stations(id,business_id,unit_id,code,name,station_type,printer_key,auto_print,sort_order) values(${stationId},${c.get('auth').businessId}::uuid,${body.data.unitId??null}::uuid,${body.data.code.toLowerCase()},${body.data.name},${body.data.stationType},${body.data.printerKey||null},${body.data.autoPrint},${body.data.sortOrder})`);}catch(reason){if(String((reason as any)?.cause?.message??reason).includes('restaurant_production_station_code_uidx'))return error(c,409,'STATION_CODE_EXISTS','Já existe uma estação com esse código');throw reason;}
  return c.json({data:{id:stationId,...body.data}},201);
});

restaurantProductionRoutes.patch('/restaurant/production/stations/:stationId',requirePermission('settings.update'),async c=>{
  const stationId=id.safeParse(c.req.param('stationId'));const body=z.object({name:z.string().trim().min(2).max(120).optional(),stationType:stationType.optional(),printerKey:z.string().trim().max(160).nullable().optional(),autoPrint:z.boolean().optional(),active:z.boolean().optional(),sortOrder:z.coerce.number().int().min(0).max(999).optional()}).refine(v=>Object.keys(v).length>0).safeParse(await c.req.json().catch(()=>null));
  if(!stationId.success||!body.success)return error(c,422,'VALIDATION_ERROR','Estação inválida');
  const current:any=rows(await c.get('db').execute(sql`select * from restaurant_production_stations where id=${stationId.success?stationId.data:null}::uuid and business_id=${c.get('auth').businessId}::uuid limit 1`))[0];if(!current)return error(c,404,'NOT_FOUND','Estação não encontrada');const d=body.data;
  const result=await c.get('db').execute(sql`update restaurant_production_stations set name=${d.name??current.name},station_type=${d.stationType??current.station_type},printer_key=${d.printerKey===undefined?current.printer_key:d.printerKey},auto_print=${d.autoPrint??current.auto_print},active=${d.active??current.active},sort_order=${d.sortOrder??current.sort_order},updated_at=now() where id=${stationId.data}::uuid and business_id=${c.get('auth').businessId}::uuid returning id,code,name,station_type,printer_key,auto_print,active,sort_order`);
  return c.json({data:rows(result)[0]});
});

restaurantProductionRoutes.get('/restaurant/production/product-routes',requirePermission('orders.read'),async c=>{
  const result=await c.get('db').execute(sql`select r.product_id,r.station_id,s.name station_name,s.station_type,s.active from restaurant_product_station_routes r join restaurant_production_stations s on s.id=r.station_id and s.business_id=r.business_id where r.business_id=${c.get('auth').businessId}::uuid order by s.sort_order,s.name`);
  return c.json({data:rows(result)});
});

restaurantProductionRoutes.put('/restaurant/production/products/:productId/routes',requirePermission('settings.update'),async c=>{
  const productId=id.safeParse(c.req.param('productId'));const body=z.object({stationIds:z.array(id).max(12)}).safeParse(await c.req.json().catch(()=>null));
  if(!productId.success||!body.success)return error(c,422,'VALIDATION_ERROR','Roteamento inválido');
  const b=c.get('auth').businessId,db=c.get('db');const product=rows(await db.execute(sql`select id from products where id=${productId.data}::uuid and business_id=${b}::uuid limit 1`))[0];if(!product)return error(c,404,'PRODUCT_NOT_FOUND','Produto não encontrado');
  if(body.data.stationIds.length){const valid=rows(await db.execute(sql`select id from restaurant_production_stations where business_id=${b}::uuid and active=true and id in ${sql.raw(`(${body.data.stationIds.map(x=>`'${x}'::uuid`).join(',')})`)}`));if(valid.length!==new Set(body.data.stationIds).size)return error(c,422,'STATION_NOT_FOUND','Uma das estações é inválida ou está inativa');}
  await db.execute(sql`delete from restaurant_product_station_routes where business_id=${b}::uuid and product_id=${productId.data}::uuid`);
  for(const stationId of new Set(body.data.stationIds))await db.execute(sql`insert into restaurant_product_station_routes(business_id,product_id,station_id) values(${b}::uuid,${productId.data}::uuid,${stationId}::uuid)`);
  return c.json({data:{productId:productId.data,stationIds:[...new Set(body.data.stationIds)]}});
});

restaurantProductionRoutes.post('/orders/:orderId/kitchen',requirePermission('orders.write'),async c=>{
  const orderId=id.safeParse(c.req.param('orderId'));if(!orderId.success)return error(c,422,'VALIDATION_ERROR','Pedido inválido');
  const b=c.get('auth').businessId,u=c.get('auth').userId,db=c.get('db');
  const order:any=rows(await db.execute(sql`select id,unit_id,table_id,tab_id,channel,status,total,notes from orders where id=${orderId.data}::uuid and business_id=${b}::uuid and status in ('open','confirmed') limit 1`))[0];if(!order)return error(c,404,'NOT_FOUND','Pedido não encontrado ou já encerrado');
  const existing=rows(await db.execute(sql`select id from kitchen_tickets where business_id=${b}::uuid and order_id=${orderId.data}::uuid and status<>'cancelled'`));if(existing.length)return c.json({data:{ticketIds:existing.map((x:any)=>x.id),status:'already_dispatched'}});
  const items=rows(await db.execute(sql`select oi.id,oi.product_id,oi.description,oi.quantity,oi.notes,coalesce(jsonb_agg(jsonb_build_object('stationId',s.id,'stationName',s.name,'stationType',s.station_type,'printerKey',s.printer_key,'autoPrint',s.auto_print)) filter(where s.id is not null),'[]'::jsonb) routes from order_items oi left join restaurant_product_station_routes r on r.business_id=oi.business_id and r.product_id=oi.product_id left join restaurant_production_stations s on s.id=r.station_id and s.business_id=r.business_id and s.active=true where oi.business_id=${b}::uuid and oi.order_id=${orderId.data}::uuid and oi.status<>'cancelled' group by oi.id`)) as any[];
  if(!items.length)return error(c,409,'ORDER_ITEMS_REQUIRED','Pedido sem itens para produção');
  let fallback:any=rows(await db.execute(sql`select id,name,station_type,printer_key,auto_print from restaurant_production_stations where business_id=${b}::uuid and active=true and code='cozinha' order by sort_order limit 1`))[0];
  if(!fallback){const fallbackId=uuidv7();await db.execute(sql`insert into restaurant_production_stations(id,business_id,unit_id,code,name,station_type,sort_order) values(${fallbackId},${b}::uuid,${order.unit_id??null}::uuid,'cozinha','Cozinha','kitchen',0)`);fallback={id:fallbackId,name:'Cozinha',station_type:'kitchen',printer_key:null,auto_print:false};}
  const groups=new Map<string,{station:any;items:any[]}>();
  for(const item of items){const routes=Array.isArray(item.routes)&&item.routes.length?item.routes:[{stationId:fallback.id,stationName:fallback.name,stationType:fallback.station_type,printerKey:fallback.printer_key,autoPrint:fallback.auto_print}];for(const route of routes){const key=String(route.stationId);const group=groups.get(key)??{station:route,items:[]};group.items.push(item);groups.set(key,group);}}
  const ticketIds:string[]=[];
  for(const group of groups.values()){
    const ticketId=uuidv7();ticketIds.push(ticketId);await db.execute(sql`insert into kitchen_tickets(id,business_id,order_id,station_id,station,status,priority) values(${ticketId},${b}::uuid,${orderId.data}::uuid,${group.station.stationId}::uuid,${group.station.stationName},'queued',0)`);
    for(const item of group.items)await db.execute(sql`insert into kitchen_ticket_items(id,business_id,kitchen_ticket_id,order_item_id,quantity) values(${uuidv7()},${b}::uuid,${ticketId}::uuid,${item.id}::uuid,${Number(item.quantity)})`);
    if(group.station.autoPrint&&group.station.printerKey){const payload={orderId:orderId.data,station:{id:group.station.stationId,name:group.station.stationName,type:group.station.stationType},channel:order.channel,tableId:order.table_id,tabId:order.tab_id,notes:order.notes,items:group.items.map(item=>({id:item.id,description:item.description,quantity:Number(item.quantity),notes:item.notes}))};await db.execute(sql`insert into print_jobs(id,business_id,unit_id,order_id,kitchen_ticket_id,station_id,job_type,printer_key,payload,status) values(${uuidv7()},${b}::uuid,${order.unit_id??null}::uuid,${orderId.data}::uuid,${ticketId}::uuid,${group.station.stationId}::uuid,'kitchen',${group.station.printerKey},${JSON.stringify(payload)}::jsonb,'pending')`);}
  }
  await db.execute(sql`update orders set status='confirmed',fulfillment_status='preparing',updated_at=now() where id=${orderId.data}::uuid and business_id=${b}::uuid`);
  await db.execute(sql`insert into audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,request_id,after_json) values(${uuidv7()},${b}::uuid,${u}::uuid,'order.production.dispatched','order',${orderId.data}::uuid,${c.get('requestId')},${JSON.stringify({ticketIds,stations:[...groups.values()].map(g=>g.station.stationName)})}::jsonb)`);
  return c.json({data:{ticketIds,status:'queued',stations:[...groups.values()].map(g=>g.station.stationName)}},201);
});

restaurantProductionRoutes.get('/kitchen',requirePermission('orders.read'),async c=>{
  const result=await c.get('db').execute(sql`select kt.id,kt.order_id,kt.status,kt.priority,kt.station_id,coalesce(s.name,kt.station,'Cozinha') station,rt.number table_number,o.channel,kt.queued_at,kt.started_at,kt.ready_at,
    coalesce(jsonb_agg(jsonb_build_object('id',oi.id,'description',oi.description,'quantity',kti.quantity,'notes',oi.notes,'status',oi.status) order by oi.created_at) filter(where oi.id is not null),'[]'::jsonb) items
    from kitchen_tickets kt join orders o on o.id=kt.order_id and o.business_id=kt.business_id left join restaurant_tables rt on rt.id=o.table_id and rt.business_id=o.business_id left join restaurant_production_stations s on s.id=kt.station_id and s.business_id=kt.business_id left join kitchen_ticket_items kti on kti.kitchen_ticket_id=kt.id and kti.business_id=kt.business_id left join order_items oi on oi.id=kti.order_item_id and oi.business_id=kti.business_id where kt.business_id=${c.get('auth').businessId}::uuid and kt.status in ('queued','preparing','ready') group by kt.id,o.id,rt.number,s.name order by kt.priority desc,kt.queued_at asc`);
  return c.json({data:rows(result)});
});
