import { Hono } from 'hono';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { kitchenTickets, restaurantOrderItems, restaurantOrders, restaurantTables, restaurantTabs } from '@nexoio/db';
import { error } from '../middleware';
import type { ApiEnv } from '../types';

export const restaurantOperationRoutes=new Hono<ApiEnv>();

restaurantOperationRoutes.get('/orders',async c=>{
 const b=c.get('auth').businessId,db=c.get('db');
 const orders=await db.select().from(restaurantOrders).where(eq(restaurantOrders.businessId,b)).orderBy(desc(restaurantOrders.createdAt)).limit(200);
 const orderIds=orders.map(o=>o.id),tabIds=[...new Set(orders.map(o=>o.tabId))];
 const items=orderIds.length?await db.select().from(restaurantOrderItems).where(and(eq(restaurantOrderItems.businessId,b),inArray(restaurantOrderItems.orderId,orderIds))):[];
 const tabs=tabIds.length?await db.select().from(restaurantTabs).where(and(eq(restaurantTabs.businessId,b),inArray(restaurantTabs.id,tabIds))):[];
 const tableIds=tabs.map(t=>t.tableId).filter(Boolean) as string[];
 const tables=tableIds.length?await db.select().from(restaurantTables).where(and(eq(restaurantTables.businessId,b),inArray(restaurantTables.id,tableIds))):[];
 const tm=new Map(tables.map(t=>[t.id,t])),tabsMap=new Map(tabs.map(t=>[t.id,{...t,table:t.tableId?tm.get(t.tableId)??null:null}]));
 return c.json({data:orders.map(o=>({...o,tab:tabsMap.get(o.tabId)??null,items:items.filter(i=>i.orderId===o.id)}))});
});

restaurantOperationRoutes.patch('/orders/:id/status',async c=>{
 const b=c.get('auth').businessId,id=c.req.param('id'),db=c.get('db'),body=await c.req.json().catch(()=>({}));
 const status=String(body.status||''); if(!['open','sent','preparing','ready','served','cancelled'].includes(status))return error(c,422,'VALIDATION_ERROR','Status de pedido inválido');
 const row=await db.select().from(restaurantOrders).where(and(eq(restaurantOrders.businessId,b),eq(restaurantOrders.id,id))).limit(1);if(!row[0])return error(c,404,'NOT_FOUND','Pedido não encontrado');
 await db.update(restaurantOrders).set({status,updatedAt:new Date()}).where(and(eq(restaurantOrders.businessId,b),eq(restaurantOrders.id,id)));
 await db.update(restaurantOrderItems).set({status:status==='served'?'served':status==='cancelled'?'cancelled':status==='ready'?'ready':status==='preparing'?'preparing':'new'}).where(and(eq(restaurantOrderItems.businessId,b),eq(restaurantOrderItems.orderId,id)));
 const ticket=await db.select().from(kitchenTickets).where(and(eq(kitchenTickets.businessId,b),eq(kitchenTickets.orderId,id))).limit(1);
 if(ticket[0]){const ts=status==='preparing'?'preparing':status==='ready'?'ready':status==='served'?'served':status==='cancelled'?'cancelled':'queued';await db.update(kitchenTickets).set({status:ts,startedAt:status==='preparing'?(ticket[0].startedAt??new Date()):ticket[0].startedAt,readyAt:status==='ready'?(ticket[0].readyAt??new Date()):ticket[0].readyAt}).where(and(eq(kitchenTickets.businessId,b),eq(kitchenTickets.id,ticket[0].id)))}
 return c.json({data:{ok:true,status}});
});

restaurantOperationRoutes.get('/kitchen',async c=>{
 const b=c.get('auth').businessId,db=c.get('db');
 const tickets=await db.select().from(kitchenTickets).where(eq(kitchenTickets.businessId,b)).orderBy(asc(kitchenTickets.createdAt)).limit(200);
 const orderIds=tickets.map(t=>t.orderId);
 const orders=orderIds.length?await db.select().from(restaurantOrders).where(and(eq(restaurantOrders.businessId,b),inArray(restaurantOrders.id,orderIds))):[];
 const items=orderIds.length?await db.select().from(restaurantOrderItems).where(and(eq(restaurantOrderItems.businessId,b),inArray(restaurantOrderItems.orderId,orderIds))):[];
 const tabIds=[...new Set(orders.map(o=>o.tabId))];const tabs=tabIds.length?await db.select().from(restaurantTabs).where(and(eq(restaurantTabs.businessId,b),inArray(restaurantTabs.id,tabIds))):[];
 const tableIds=tabs.map(t=>t.tableId).filter(Boolean) as string[];const tables=tableIds.length?await db.select().from(restaurantTables).where(and(eq(restaurantTables.businessId,b),inArray(restaurantTables.id,tableIds))):[];
 const om=new Map(orders.map(o=>[o.id,o])),tabm=new Map(tabs.map(t=>[t.id,t])),tablem=new Map(tables.map(t=>[t.id,t]));
 return c.json({data:tickets.map(t=>{const o=om.get(t.orderId),tab=o?tabm.get(o.tabId):undefined,table=tab?.tableId?tablem.get(tab.tableId):undefined;return{...t,order:o?{...o,items:items.filter(i=>i.orderId===o.id)}:null,tab:tab??null,table:table??null}})});
});

restaurantOperationRoutes.patch('/kitchen/:id/status',async c=>{
 const b=c.get('auth').businessId,id=c.req.param('id'),db=c.get('db'),body=await c.req.json().catch(()=>({})),status=String(body.status||'');
 if(!['queued','preparing','ready','served','cancelled'].includes(status))return error(c,422,'VALIDATION_ERROR','Status de cozinha inválido');
 const row=await db.select().from(kitchenTickets).where(and(eq(kitchenTickets.businessId,b),eq(kitchenTickets.id,id))).limit(1);if(!row[0])return error(c,404,'NOT_FOUND','Ticket não encontrado');
 await db.update(kitchenTickets).set({status,startedAt:status==='preparing'?(row[0].startedAt??new Date()):row[0].startedAt,readyAt:status==='ready'?(row[0].readyAt??new Date()):row[0].readyAt}).where(and(eq(kitchenTickets.businessId,b),eq(kitchenTickets.id,id)));
 const os=status==='queued'?'sent':status;await db.update(restaurantOrders).set({status:os,updatedAt:new Date()}).where(and(eq(restaurantOrders.businessId,b),eq(restaurantOrders.id,row[0].orderId)));
 await db.update(restaurantOrderItems).set({status:status==='queued'?'new':status}).where(and(eq(restaurantOrderItems.businessId,b),eq(restaurantOrderItems.orderId,row[0].orderId)));
 return c.json({data:{ok:true,status}});
});

restaurantOperationRoutes.patch('/tabs/:id/fulfillment',async c=>{
 const b=c.get('auth').businessId,id=c.req.param('id'),db=c.get('db'),body=await c.req.json().catch(()=>({}));
 const row=await db.select().from(restaurantTabs).where(and(eq(restaurantTabs.businessId,b),eq(restaurantTabs.id,id))).limit(1);if(!row[0])return error(c,404,'NOT_FOUND','Comanda não encontrada');
 const current=(row[0].fulfillmentJson&&typeof row[0].fulfillmentJson==='object'?row[0].fulfillmentJson:{}) as Record<string,unknown>;
 const fulfillmentJson={...current,...(body.customerName!==undefined?{customerName:String(body.customerName)}:{}),...(body.phone!==undefined?{phone:String(body.phone)}:{}),...(body.address!==undefined?{address:String(body.address)}:{}),...(body.courierName!==undefined?{courierName:String(body.courierName)}:{}),...(body.deliveryStatus!==undefined?{deliveryStatus:String(body.deliveryStatus)}:{})};
 await db.update(restaurantTabs).set({fulfillmentJson,updatedAt:new Date()}).where(and(eq(restaurantTabs.businessId,b),eq(restaurantTabs.id,id)));
 return c.json({data:{ok:true,fulfillmentJson}});
});
