import { Hono } from 'hono';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { appointments, cashMovements, cashSessions, customers, restaurantOrders, restaurantTables, saleItems, salePayments, sales } from '@nexoio/db';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const operationRoutes=new Hono<ApiEnv>();
const num=(v:unknown)=>Number(v??0);
const todayRange=()=>{const now=new Date();const start=new Date(now);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);return{start,end}};

operationRoutes.get('/dashboard',async c=>{
 const b=c.get('auth').businessId,db=c.get('db'),{start,end}=todayRange();
 const [saleAgg,appointmentAgg,customerAgg,orderAgg,tableAgg,cash]=await Promise.all([
  db.select({count:sql<number>`count(*)`,total:sql<string>`coalesce(sum(${sales.total}),0)`}).from(sales).where(and(eq(sales.businessId,b),eq(sales.status,'completed'),gte(sales.createdAt,start),lt(sales.createdAt,end))),
  db.select({count:sql<number>`count(*)`}).from(appointments).where(and(eq(appointments.businessId,b),gte(appointments.startsAt,start),lt(appointments.startsAt,end))),
  db.select({count:sql<number>`count(*)`}).from(customers).where(and(eq(customers.businessId,b),gte(customers.createdAt,start),lt(customers.createdAt,end))),
  db.select({count:sql<number>`count(*)`}).from(restaurantOrders).where(and(eq(restaurantOrders.businessId,b),inArray(restaurantOrders.status,['open','sent','preparing','ready']))),
  db.select({count:sql<number>`count(*)`}).from(restaurantTables).where(and(eq(restaurantTables.businessId,b),inArray(restaurantTables.status,['occupied','closing']))),
  db.select().from(cashSessions).where(and(eq(cashSessions.businessId,b),eq(cashSessions.status,'open'))).orderBy(desc(cashSessions.openedAt)).limit(1)
 ]);
 return c.json({data:{salesToday:Number(saleAgg[0]?.count||0),revenueToday:num(saleAgg[0]?.total),appointmentsToday:Number(appointmentAgg[0]?.count||0),newCustomersToday:Number(customerAgg[0]?.count||0),activeOrders:Number(orderAgg[0]?.count||0),occupiedTables:Number(tableAgg[0]?.count||0),cashOpen:Boolean(cash[0])}});
});

operationRoutes.get('/sales',requirePermission('sales.read'),async c=>{
 const b=c.get('auth').businessId,db=c.get('db');
 const rows=await db.select().from(sales).where(eq(sales.businessId,b)).orderBy(desc(sales.createdAt)).limit(200);
 const ids=rows.map(x=>x.id),customerIds=rows.map(x=>x.customerId).filter(Boolean) as string[];
 const [payments,customerRows]=await Promise.all([
  ids.length?db.select().from(salePayments).where(and(eq(salePayments.businessId,b),inArray(salePayments.saleId,ids))):Promise.resolve([]),
  customerIds.length?db.select({id:customers.id,name:customers.name}).from(customers).where(and(eq(customers.businessId,b),inArray(customers.id,customerIds))):Promise.resolve([])
 ]);
 const names=new Map(customerRows.map(x=>[x.id,x.name]));
 return c.json({data:rows.map(row=>({...row,customerName:row.customerId?names.get(row.customerId)??null:null,payments:payments.filter(p=>p.saleId===row.id)}))});
});

operationRoutes.post('/sales',requirePermission('sales.create'),async c=>{
 const b=c.get('auth').businessId,user=c.get('auth').userId,db=c.get('db'),body=await c.req.json().catch(()=>({}));
 const description=String(body.description||'').trim(),total=num(body.total),method=String(body.method||'dinheiro').trim(),customerId=body.customerId?String(body.customerId):null;
 if(!description||!Number.isFinite(total)||total<=0)return error(c,422,'VALIDATION_ERROR','Informe descrição e valor válidos');
 if(customerId){const found=await db.select({id:customers.id}).from(customers).where(and(eq(customers.businessId,b),eq(customers.id,customerId))).limit(1);if(!found[0])return error(c,404,'CUSTOMER_NOT_FOUND','Cliente não encontrado');}
 const saleId=uuidv7(),paymentId=uuidv7();
 await db.insert(sales).values({id:saleId,businessId:b,customerId,sellerUserId:user,status:'completed',subtotal:total.toFixed(2),discount:'0',total:total.toFixed(2),notes:body.notes?String(body.notes):null,completedAt:new Date()});
 await db.insert(saleItems).values({id:uuidv7(),businessId:b,saleId,itemType:'other',description,quantity:'1',unitPrice:total.toFixed(2),discount:'0',total:total.toFixed(2)});
 await db.insert(salePayments).values({id:paymentId,businessId:b,saleId,method,amount:total.toFixed(2),status:'paid',paidAt:new Date()});
 const cash=(await db.select().from(cashSessions).where(and(eq(cashSessions.businessId,b),eq(cashSessions.status,'open'))).orderBy(desc(cashSessions.openedAt)).limit(1))[0];
 if(cash)await db.insert(cashMovements).values({id:uuidv7(),businessId:b,cashSessionId:cash.id,movementType:'sale',amount:total.toFixed(2),referenceType:'sale',referenceId:saleId,description:`Venda ${description}`,createdBy:user});
 return c.json({data:{id:saleId,paymentId}},201);
});

operationRoutes.get('/finance',requirePermission('finance.read'),async c=>{
 const b=c.get('auth').businessId,db=c.get('db'),{start,end}=todayRange();
 const [salesAgg,movements]=await Promise.all([
  db.select({count:sql<number>`count(*)`,revenue:sql<string>`coalesce(sum(${sales.total}),0)`}).from(sales).where(and(eq(sales.businessId,b),eq(sales.status,'completed'),gte(sales.createdAt,start),lt(sales.createdAt,end))),
  db.select().from(cashMovements).where(eq(cashMovements.businessId,b)).orderBy(desc(cashMovements.createdAt)).limit(100)
 ]);
 const entries=movements.filter(x=>!['withdrawal','expense','refund','out'].includes(x.movementType)).reduce((s,x)=>s+num(x.amount),0);
 const exits=movements.filter(x=>['withdrawal','expense','refund','out'].includes(x.movementType)).reduce((s,x)=>s+Math.abs(num(x.amount)),0);
 return c.json({data:{salesToday:Number(salesAgg[0]?.count||0),revenueToday:num(salesAgg[0]?.revenue),entries,exits,result:entries-exits,movements}});
});
