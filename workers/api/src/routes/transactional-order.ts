import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const transactionalOrderRoutes=new Hono<ApiEnv>();
transactionalOrderRoutes.post('/orders/:orderId/close',requirePermission('orders.write'),async c=>{
  const orderId=z.uuid().safeParse(c.req.param('orderId'));if(!orderId.success)return error(c,422,'VALIDATION_ERROR','Pedido inválido');
  try{
    const result:any=await c.get('db').execute(sql`select * from close_order_transactional(${c.get('auth').businessId}::uuid,${orderId.data}::uuid,${c.get('auth').userId}::uuid)`);
    const row=(result?.rows??result??[])[0];if(!row)return error(c,500,'ORDER_CLOSE_FAILED','Fechamento não retornou resultado');return c.json({data:{id:row.order_id,saleId:row.sale_id,total:row.total,status:'closed'}});
  }catch(reason){const message=reason instanceof Error?reason.message:String(reason);if(message.includes('ORDER_NOT_FOUND'))return error(c,404,'NOT_FOUND','Pedido não encontrado');if(message.includes('ORDER_ALREADY_FINAL'))return error(c,409,'ORDER_ALREADY_FINAL','Pedido já foi encerrado');if(message.includes('PAYMENT_PENDING'))return error(c,409,'PAYMENT_PENDING','O pedido precisa estar totalmente pago');if(message.includes('INVENTORY_LOCATION_REQUIRED'))return error(c,409,'INVENTORY_LOCATION_REQUIRED','Configure um local de estoque antes de fechar a venda');if(message.includes('INSUFFICIENT_STOCK'))return error(c,409,'INSUFFICIENT_STOCK','Estoque insuficiente para concluir o pedido');throw reason;}
});
