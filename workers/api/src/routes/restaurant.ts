import { Hono } from 'hono';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { inventoryMovements, kitchenTickets, restaurantOrderItems, restaurantOrders, restaurantPayments, restaurantTables, restaurantTabs, saleItems, sales } from '@nexoio/db';
import { uuidv7 } from '@nexoio/core';
import { error } from '../middleware';
import type { ApiEnv } from '../types';

export const restaurantRoutes=new Hono<ApiEnv>();
const n=(v:unknown)=>Number(v??0);

restaurantRoutes.get('/tables',async c=>{
 const b=c.get('auth').businessId,db=c.get('db');
 const rows=await db.select().from(restaurantTables).where(eq(restaurantTables.businessId,b)).orderBy(asc(restaurantTables.code));
 const tabIds=rows.map(r=>r.currentTabId).filter(Boolean) as string[];
 const tabs=tabIds.length?await db.select().from(restaurantTabs).where(and(eq(restaurantTabs.businessId,b),inArray(restaurantTabs.id,tabIds))):[];
 const byId=new Map(tabs.map(t=>[t.id,t]));
 return c.json({data:rows.map(r=>({...r,currentTab:r.currentTabId?byId.get(r.currentTabId)??null:null}))});
});
restaurantRoutes.post('/tables',async c=>{
 const body=await c.req.json().catch(()=>({})); const code=String(body.code??'').trim(); if(!code)return error(c,400,'VALIDATION_ERROR','Informe o número/código da mesa');
 const row={id:uuidv7(),businessId:c.get('auth').businessId,code,capacity:Math.max(1,Number(body.capacity??4)),area:String(body.area??'').trim()||null,status:'free'};
 try{await c.get('db').insert(restaurantTables).values(row);return c.json({data:row},201)}catch{return error(c,409,'TABLE_EXISTS','Já existe uma mesa com esse código')}
});
restaurantRoutes.patch('/tables/:id',async c=>{
 const body=await c.req.json().catch(()=>({})); const b=c.get('auth').businessId,id=c.req.param('id');
 const found=await c.get('db').select().from(restaurantTables).where(and(eq(restaurantTables.id,id),eq(restaurantTables.businessId,b))).limit(1); if(!found[0])return error(c,404,'NOT_FOUND','Mesa não encontrada');
 await c.get('db').update(restaurantTables).set({capacity:body.capacity===undefined?found[0].capacity:Math.max(1,Number(body.capacity)),area:body.area===undefined?found[0].area:String(body.area||'').trim()||null,updatedAt:new Date()}).where(and(eq(restaurantTables.id,id),eq(restaurantTables.businessId,b)));
 return c.json({data:{ok:true}});
});

restaurantRoutes.get('/tabs',async c=>{
 const b=c.get('auth').businessId,db=c.get('db');
 const rows=await db.select().from(restaurantTabs).where(eq(restaurantTabs.businessId,b)).orderBy(desc(restaurantTabs.openedAt));
 const tableIds=rows.map(r=>r.tableId).filter(Boolean) as string[]; const tables=tableIds.length?await db.select().from(restaurantTables).where(and(eq(restaurantTables.businessId,b),inArray(restaurantTables.id,tableIds))):[]; const tm=new Map(tables.map(t=>[t.id,t]));
 return c.json({data:rows.map(r=>({...r,table:r.tableId?tm.get(r.tableId)??null:null}))});
});
restaurantRoutes.post('/tabs',async c=>{
 const body=await c.req.json().catch(()=>({})); const b=c.get('auth').businessId,db=c.get('db'); const tableId=body.tableId?String(body.tableId):null;
 if(tableId){const t=await db.select().from(restaurantTables).where(and(eq(restaurantTables.id,tableId),eq(restaurantTables.businessId,b))).limit(1);if(!t[0])return error(c,404,'NOT_FOUND','Mesa não encontrada');if(t[0].status!=='free')return error(c,409,'TABLE_OCCUPIED','Essa mesa já está ocupada');}
 const code=String(body.code??`C${Date.now().toString().slice(-6)}`).trim(); const id=uuidv7();
 const row={id,businessId:b,code,tableId,customerId:body.customerId?String(body.customerId):null,channel:String(body.channel??(tableId?'table':'counter')),status:'active',subtotal:'0',discount:'0',total:'0',createdBy:c.get('auth').userId};
 try{await db.insert(restaurantTabs).values(row)}catch{return error(c,409,'TAB_EXISTS','Já existe uma comanda com esse código')}
 if(tableId)await db.update(restaurantTables).set({status:'occupied',currentTabId:id,occupiedAt:new Date(),updatedAt:new Date()}).where(and(eq(restaurantTables.id,tableId),eq(restaurantTables.businessId,b)));
 return c.json({data:row},201);
});
restaurantRoutes.get('/tabs/:id',async c=>{
 const b=c.get('auth').businessId,id=c.req.param('id'),db=c.get('db'); const tab=await db.select().from(restaurantTabs).where(and(eq(restaurantTabs.id,id),eq(restaurantTabs.businessId,b))).limit(1);if(!tab[0])return error(c,404,'NOT_FOUND','Comanda não encontrada');
 const orders=await db.select().from(restaurantOrders).where(and(eq(restaurantOrders.businessId,b),eq(restaurantOrders.tabId,id))).orderBy(asc(restaurantOrders.createdAt)); const ids=orders.map(o=>o.id); const items=ids.length?await db.select().from(restaurantOrderItems).where(and(eq(restaurantOrderItems.businessId,b),inArray(restaurantOrderItems.orderId,ids))):[]; const payments=await db.select().from(restaurantPayments).where(and(eq(restaurantPayments.businessId,b),eq(restaurantPayments.tabId,id)));
 return c.json({data:{...tab[0],orders:orders.map(o=>({...o,items:items.filter(i=>i.orderId===o.id)})),payments}});
});
restaurantRoutes.post('/tabs/:id/orders',async c=>{
 const b=c.get('auth').businessId,id=c.req.param('id'),db=c.get('db'),body=await c.req.json().catch(()=>({})); const tab=await db.select().from(restaurantTabs).where(and(eq(restaurantTabs.id,id),eq(restaurantTabs.businessId,b))).limit(1);if(!tab[0]||!['active','awaiting_closure'].includes(tab[0].status))return error(c,409,'TAB_NOT_OPEN','Comanda não está aberta');
 const items=Array.isArray(body.items)?body.items:[];if(!items.length)return error(c,400,'VALIDATION_ERROR','Inclua pelo menos um item'); const orderId=uuidv7(); await db.insert(restaurantOrders).values({id:orderId,businessId:b,tabId:id,status:'sent',notes:body.notes?String(body.notes):null,createdBy:c.get('auth').userId});
 const values=items.map((it:any)=>{const q=Math.max(.001,n(it.quantity||1)),u=Math.max(0,n(it.unitPrice));return{id:uuidv7(),businessId:b,orderId,productId:it.productId?String(it.productId):null,description:String(it.description||'Item'),quantity:String(q),unitPrice:u.toFixed(2),total:(q*u).toFixed(2),status:'new'}}); await db.insert(restaurantOrderItems).values(values); await db.insert(kitchenTickets).values({id:uuidv7(),businessId:b,orderId,status:'queued'});
 const allOrders=await db.select({id:restaurantOrders.id}).from(restaurantOrders).where(and(eq(restaurantOrders.businessId,b),eq(restaurantOrders.tabId,id))); const allItems=allOrders.length?await db.select().from(restaurantOrderItems).where(and(eq(restaurantOrderItems.businessId,b),inArray(restaurantOrderItems.orderId,allOrders.map(o=>o.id)))):[]; const subtotal=allItems.reduce((s,i)=>s+n(i.total),0); const discount=n(tab[0].discount),total=Math.max(0,subtotal-discount); await db.update(restaurantTabs).set({subtotal:subtotal.toFixed(2),total:total.toFixed(2),status:'active',updatedAt:new Date()}).where(eq(restaurantTabs.id,id)); return c.json({data:{orderId,subtotal,total}},201);
});
restaurantRoutes.post('/tabs/:id/request-closure',async c=>{const b=c.get('auth').businessId,id=c.req.param('id'),db=c.get('db');const tab=await db.select().from(restaurantTabs).where(and(eq(restaurantTabs.id,id),eq(restaurantTabs.businessId,b))).limit(1);if(!tab[0])return error(c,404,'NOT_FOUND','Comanda não encontrada');await db.update(restaurantTabs).set({status:'awaiting_closure',requestedClosureAt:new Date(),updatedAt:new Date()}).where(eq(restaurantTabs.id,id));if(tab[0].tableId)await db.update(restaurantTables).set({status:'closing',updatedAt:new Date()}).where(and(eq(restaurantTables.id,tab[0].tableId),eq(restaurantTables.businessId,b)));return c.json({data:{ok:true}})});
restaurantRoutes.post('/tabs/:id/payments',async c=>{const b=c.get('auth').businessId,id=c.req.param('id'),db=c.get('db'),body=await c.req.json().catch(()=>({}));const tab=await db.select().from(restaurantTabs).where(and(eq(restaurantTabs.id,id),eq(restaurantTabs.businessId,b))).limit(1);if(!tab[0])return error(c,404,'NOT_FOUND','Comanda não encontrada');const amount=Math.max(0,n(body.amount));if(amount<=0)return error(c,400,'VALIDATION_ERROR','Valor inválido');await db.insert(restaurantPayments).values({id:uuidv7(),businessId:b,tabId:id,method:String(body.method||'dinheiro'),amount:amount.toFixed(2),status:'confirmed',externalReference:body.externalReference?String(body.externalReference):null});await db.update(restaurantTabs).set({status:'payment_processing',updatedAt:new Date()}).where(eq(restaurantTabs.id,id));return c.json({data:{ok:true}})});
restaurantRoutes.post('/tabs/:id/close',async c=>{const b=c.get('auth').businessId,id=c.req.param('id'),db=c.get('db'),user=c.get('auth').userId;const tab=await db.select().from(restaurantTabs).where(and(eq(restaurantTabs.id,id),eq(restaurantTabs.businessId,b))).limit(1);if(!tab[0])return error(c,404,'NOT_FOUND','Comanda não encontrada');if(tab[0].saleId)return c.json({data:{saleId:tab[0].saleId,alreadyClosed:true}});const pays=await db.select().from(restaurantPayments).where(and(eq(restaurantPayments.businessId,b),eq(restaurantPayments.tabId,id),eq(restaurantPayments.status,'confirmed')));if(pays.reduce((s,p)=>s+n(p.amount),0)+0.001<n(tab[0].total))return error(c,409,'PAYMENT_INCOMPLETE','Pagamento ainda não cobre o total da comanda');const saleId=uuidv7();await db.insert(sales).values({id:saleId,businessId:b,customerId:tab[0].customerId,sellerUserId:user,status:'completed',subtotal:String(tab[0].subtotal),discount:String(tab[0].discount),total:String(tab[0].total),notes:`Comanda ${tab[0].code}`,completedAt:new Date()});const orders=await db.select({id:restaurantOrders.id}).from(restaurantOrders).where(and(eq(restaurantOrders.businessId,b),eq(restaurantOrders.tabId,id)));const items=orders.length?await db.select().from(restaurantOrderItems).where(and(eq(restaurantOrderItems.businessId,b),inArray(restaurantOrderItems.orderId,orders.map(o=>o.id)))):[];for(const i of items){await db.insert(saleItems).values({id:uuidv7(),businessId:b,saleId,itemType:'product',productId:i.productId,description:i.description,quantity:String(i.quantity),unitPrice:String(i.unitPrice),discount:'0',total:String(i.total)});if(i.productId)await db.insert(inventoryMovements).values({id:uuidv7(),businessId:b,productId:i.productId,movementType:'sale',quantity:String(-n(i.quantity)),referenceType:'sale',referenceId:saleId,createdBy:user});}await db.update(restaurantTabs).set({status:'closed',saleId,closedAt:new Date(),updatedAt:new Date()}).where(eq(restaurantTabs.id,id));if(tab[0].tableId)await db.update(restaurantTables).set({status:'free',currentTabId:null,occupiedAt:null,updatedAt:new Date()}).where(and(eq(restaurantTables.id,tab[0].tableId),eq(restaurantTables.businessId,b)));return c.json({data:{saleId}})});
