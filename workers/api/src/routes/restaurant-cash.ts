import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const restaurantCashRoutes=new Hono<ApiEnv>();
const rows=(result:any)=>result?.rows??result??[];
const id=z.uuid();

restaurantCashRoutes.get('/restaurant/standalone-accounts',requirePermission('orders.read'),async c=>{
  const b=c.get('auth').businessId;
  const result=await c.get('db').execute(sql`
    select o.id account_id,o.channel,coalesce(c.name,'Consumidor') customer_name,o.opened_at,
      o.total,coalesce(p.paid,0) paid,greatest(o.total-coalesce(p.paid,0),0) due,
      o.fulfillment_status,o.payment_status
    from orders o
    left join customers c on c.id=o.customer_id and c.business_id=o.business_id
    left join lateral (
      select coalesce(sum(op.amount) filter(where op.status='paid'),0) paid
      from order_payments op where op.business_id=o.business_id and op.order_id=o.id
    ) p on true
    where o.business_id=${b}::uuid
      and o.table_id is null and o.tab_id is null
      and o.channel in ('counter','pickup','delivery','online')
      and o.status not in ('closed','cancelled')
      and greatest(o.total-coalesce(p.paid,0),0)>0
    order by o.opened_at asc
  `);
  return c.json({data:rows(result)});
});

restaurantCashRoutes.post('/restaurant/orders/:orderId/pay',requirePermission('sales.create'),async c=>{
  const orderId=id.safeParse(c.req.param('orderId'));
  const body=z.object({method:z.string().trim().min(1).max(40),amount:z.coerce.number().positive()}).safeParse(await c.req.json().catch(()=>null));
  if(!orderId.success||!body.success)return error(c,422,'VALIDATION_ERROR','Pagamento inválido');
  const b=c.get('auth').businessId,u=c.get('auth').userId,db=c.get('db');
  const order:any=rows(await db.execute(sql`select id,total,status from orders where id=${orderId.data}::uuid and business_id=${b}::uuid and table_id is null and tab_id is null for update`))[0];
  if(!order)return error(c,404,'ORDER_NOT_FOUND','Pedido não encontrado');
  if(['closed','cancelled'].includes(order.status))return error(c,409,'ORDER_ALREADY_FINAL','Pedido já encerrado');
  const paidResult:any=rows(await db.execute(sql`select coalesce(sum(amount) filter(where status='paid'),0) paid from order_payments where business_id=${b}::uuid and order_id=${orderId.data}::uuid`))[0];
  const paid=Number(paidResult?.paid??0),due=Math.max(0,Number(order.total)-paid);
  if(due<=0)return error(c,409,'ORDER_HAS_NO_BALANCE','Pedido não possui saldo em aberto');
  if(body.data.amount>due+0.001)return error(c,409,'AMOUNT_EXCEEDS_BALANCE','Pagamento maior que o saldo do pedido',{due});
  const paymentId=uuidv7();
  await db.execute(sql`insert into order_payments(id,business_id,order_id,method,amount,status,paid_at,created_at) values(${paymentId},${b}::uuid,${orderId.data}::uuid,${body.data.method},${body.data.amount},'paid',now(),now())`);
  const remaining=Math.max(0,due-body.data.amount);
  if(remaining<=0.001){
    await db.execute(sql`update orders set payment_status='paid',updated_at=now() where id=${orderId.data}::uuid and business_id=${b}::uuid`);
    try{await db.execute(sql`select * from close_order_transactional(${b}::uuid,${orderId.data}::uuid,${u}::uuid)`)}catch(reason){const message=reason instanceof Error?reason.message:String(reason);if(message.includes('INVENTORY_LOCATION_REQUIRED'))return error(c,409,'INVENTORY_LOCATION_REQUIRED','Configure um local de estoque antes de concluir a venda');if(message.includes('INSUFFICIENT_STOCK'))return error(c,409,'INSUFFICIENT_STOCK','Estoque insuficiente para concluir a venda');throw reason;}
    return c.json({data:{orderId:orderId.data,paymentId,paid:body.data.amount,remaining:0,status:'closed'}});
  }
  await db.execute(sql`update orders set payment_status='partial',updated_at=now() where id=${orderId.data}::uuid and business_id=${b}::uuid`);
  return c.json({data:{orderId:orderId.data,paymentId,paid:body.data.amount,remaining,status:'open'}});
});
