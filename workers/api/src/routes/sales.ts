import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const salesRoutes=new Hono<ApiEnv>();const rows=(r:any)=>r?.rows??r??[];
salesRoutes.get('/sales',requirePermission('sales.read'),async c=>{const result=await c.get('db').execute(sql`select s.*,cu.name customer_name,coalesce((select jsonb_agg(jsonb_build_object('description',si.description,'quantity',si.quantity,'unitPrice',si.unit_price,'total',si.total)) from sale_items si where si.sale_id=s.id and si.business_id=s.business_id),'[]'::jsonb) items,coalesce((select jsonb_agg(jsonb_build_object('method',sp.method,'amount',sp.amount,'status',sp.status)) from sale_payments sp where sp.sale_id=s.id and sp.business_id=s.business_id),'[]'::jsonb) payments,coalesce((select jsonb_agg(jsonb_build_object('amount',pr.amount,'status',pr.status,'reason',pr.reason)) from payment_refunds pr join sale_payments sp on sp.id=pr.sale_payment_id where sp.sale_id=s.id and pr.business_id=s.business_id),'[]'::jsonb) refunds from sales s left join customers cu on cu.id=s.customer_id and cu.business_id=s.business_id where s.business_id=${c.get('auth').businessId}::uuid order by s.created_at desc limit 300`);return c.json({data:rows(result)});});

salesRoutes.post('/sales',requirePermission('sales.create'),async c=>{const p=z.object({customerId:z.uuid().nullish(),description:z.string().trim().min(1).max(500),total:z.coerce.number().finite().positive(),method:z.string().trim().min(1).max(50),notes:z.string().max(2000).nullish()}).safeParse(await c.req.json().catch(()=>null));if(!p.success)return error(c,422,'VALIDATION_ERROR','Venda inválida',p.error.flatten());const saleId=uuidv7(),itemId=uuidv7(),paymentId=uuidv7(),cashMovementId=uuidv7();const result=await c.get('db').execute(sql`
with customer_ok as (select id from customers where id=${p.data.customerId??null}::uuid and business_id=${c.get('auth').businessId}::uuid),
new_sale as (
 insert into sales(id,business_id,customer_id,seller_user_id,status,subtotal,discount,total,notes,created_at,completed_at)
 select ${saleId},${c.get('auth').businessId}::uuid,case when ${p.data.customerId??null}::uuid is null then null else (select id from customer_ok) end,${c.get('auth').userId}::uuid,'completed',${p.data.total},0,${p.data.total},${p.data.notes??null},now(),now()
 where ${p.data.customerId??null}::uuid is null or exists(select 1 from customer_ok) returning id
),new_item as (
 insert into sale_items(id,business_id,sale_id,item_type,description,quantity,unit_price,discount,total)
 select ${itemId},${c.get('auth').businessId}::uuid,id,'custom',${p.data.description},1,${p.data.total},0,${p.data.total} from new_sale returning id
),new_payment as (
 insert into sale_payments(id,business_id,sale_id,method,amount,status,paid_at)
 select ${paymentId},${c.get('auth').businessId}::uuid,id,${p.data.method},${p.data.total},'paid',now() from new_sale returning id
),cash_session as (
 select id from cash_sessions where business_id=${c.get('auth').businessId}::uuid and opened_by=${c.get('auth').userId}::uuid and status='open' order by opened_at desc limit 1
),cash_insert as (
 insert into cash_movements(id,business_id,cash_session_id,movement_type,amount,reference_type,reference_id,description,created_by)
 select ${cashMovementId},${c.get('auth').businessId}::uuid,cs.id,'sale',${p.data.total},'sale',${saleId}::uuid,'Venda manual em dinheiro',${c.get('auth').userId}::uuid from cash_session cs where lower(${p.data.method}) in ('cash','dinheiro') returning id
)
select id from new_sale`);if(!rows(result).length)return error(c,404,'CUSTOMER_NOT_FOUND','Cliente não encontrado');await c.get('db').execute(sql`insert into audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,request_id,after_json) values(${uuidv7()},${c.get('auth').businessId}::uuid,${c.get('auth').userId}::uuid,'sale.created','sale',${saleId}::uuid,${c.get('requestId')},${JSON.stringify({total:p.data.total,method:p.data.method})}::jsonb)`);return c.json({data:{id:saleId,status:'completed',total:p.data.total}},201);});

async function refund(c:any,saleId:string,reason:string){try{const result=await c.get('db').execute(sql`select * from refund_sale_transactional(${c.get('auth').businessId}::uuid,${saleId}::uuid,${c.get('auth').userId}::uuid,${reason})`);const row:any=rows(result)[0];return c.json({data:{id:saleId,status:Number(row?.pending_provider_refunds??0)>0?'refund_pending':'refunded',refundedAmount:row?.refunded_amount??0,pendingProviderRefunds:Number(row?.pending_provider_refunds??0)}})}catch(value){const message=value instanceof Error?value.message:String(value);if(message.includes('SALE_NOT_FOUND'))return error(c,404,'NOT_FOUND','Venda não encontrada');if(message.includes('SALE_ALREADY_REFUNDED'))return error(c,409,'SALE_ALREADY_REFUNDED','Venda já estornada');if(message.includes('OPEN_CASH_REQUIRED_FOR_CASH_REFUND'))return error(c,409,'OPEN_CASH_REQUIRED','Abra um caixa antes de fazer estorno em dinheiro');throw value;}}
salesRoutes.post('/sales/:id/refund',requirePermission('sales.cancel'),async c=>{const saleId=z.uuid().safeParse(c.req.param('id'));const p=z.object({reason:z.string().trim().min(3).max(1000)}).safeParse(await c.req.json().catch(()=>null));if(!saleId.success||!p.success)return error(c,422,'VALIDATION_ERROR','Estorno inválido');return refund(c,saleId.data,p.data.reason);});
salesRoutes.post('/sales/:id/cancel',requirePermission('sales.cancel'),async c=>{const saleId=z.uuid().safeParse(c.req.param('id'));const p=z.object({reason:z.string().trim().min(3).max(1000)}).safeParse(await c.req.json().catch(()=>null));if(!saleId.success||!p.success)return error(c,422,'VALIDATION_ERROR','Cancelamento inválido');return refund(c,saleId.data,p.data.reason);});
