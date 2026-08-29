import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const procurementRoutes=new Hono<ApiEnv>();
const id=z.uuid();
const rows=(r:any)=>r?.rows??r??[];

procurementRoutes.get('/suppliers',requirePermission('inventory.read'),async c=>{
  const result=await c.get('db').execute(sql`select * from suppliers where business_id=${c.get('auth').businessId}::uuid order by active desc,name`);
  return c.json({data:rows(result)});
});

procurementRoutes.post('/suppliers',requirePermission('inventory.write'),async c=>{
  const parsed=z.object({name:z.string().trim().min(2).max(180),documentNumber:z.string().max(40).nullish(),email:z.email().nullish(),phone:z.string().max(40).nullish(),notes:z.string().max(2000).nullish()}).safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return error(c,422,'VALIDATION_ERROR','Fornecedor inválido',parsed.error.flatten());
  const supplierId=uuidv7();
  await c.get('db').execute(sql`insert into suppliers(id,business_id,name,document_number,email,phone,notes) values(${supplierId},${c.get('auth').businessId}::uuid,${parsed.data.name},${parsed.data.documentNumber??null},${parsed.data.email??null},${parsed.data.phone??null},${parsed.data.notes??null})`);
  return c.json({data:{id:supplierId,...parsed.data}},201);
});

procurementRoutes.get('/purchase-orders',requirePermission('inventory.read'),async c=>{
  const result=await c.get('db').execute(sql`select po.*,s.name supplier_name,il.name location_name,
    coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'variantId',i.variant_id,'description',i.description,'orderedQuantity',i.ordered_quantity,'receivedQuantity',i.received_quantity,'unitCost',i.unit_cost,'total',i.total) order by i.description) from purchase_order_items i where i.purchase_order_id=po.id and i.business_id=po.business_id),'[]'::jsonb) items
    from purchase_orders po left join suppliers s on s.id=po.supplier_id and s.business_id=po.business_id join inventory_locations il on il.id=po.location_id and il.business_id=po.business_id
    where po.business_id=${c.get('auth').businessId}::uuid order by po.created_at desc limit 500`);
  return c.json({data:rows(result)});
});

procurementRoutes.post('/purchase-orders',requirePermission('inventory.write'),async c=>{
  const parsed=z.object({supplierId:id.nullish(),locationId:id,expectedOn:z.iso.date().nullish(),notes:z.string().max(2000).nullish(),items:z.array(z.object({productId:id,variantId:id.nullish(),description:z.string().trim().min(1).max(300),quantity:z.coerce.number().finite().positive(),unitCost:z.coerce.number().finite().nonnegative()})).min(1).max(500)}).safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return error(c,422,'VALIDATION_ERROR','Pedido de compra inválido',parsed.error.flatten());
  const businessId=c.get('auth').businessId;
  const location=rows(await c.get('db').execute(sql`select id from inventory_locations where id=${parsed.data.locationId}::uuid and business_id=${businessId}::uuid and active=true`));
  if(!location.length)return error(c,404,'NOT_FOUND','Local de estoque não encontrado');
  if(parsed.data.supplierId){const supplier=rows(await c.get('db').execute(sql`select id from suppliers where id=${parsed.data.supplierId}::uuid and business_id=${businessId}::uuid and active=true`));if(!supplier.length)return error(c,404,'NOT_FOUND','Fornecedor não encontrado');}
  const productIds=parsed.data.items.map(item=>item.productId);
  const found=rows(await c.get('db').execute(sql`select id from products where business_id=${businessId}::uuid and id=any(${productIds}::uuid[])`));
  if(found.length!==new Set(productIds).size)return error(c,404,'NOT_FOUND','Um ou mais produtos não pertencem à empresa');
  const orderId=uuidv7();const total=parsed.data.items.reduce((sum,item)=>sum+item.quantity*item.unitCost,0);
  await c.get('db').execute(sql`insert into purchase_orders(id,business_id,supplier_id,location_id,status,expected_on,subtotal,total,notes,created_by,ordered_at) values(${orderId},${businessId}::uuid,${parsed.data.supplierId??null}::uuid,${parsed.data.locationId}::uuid,'ordered',${parsed.data.expectedOn??null}::date,${total},${total},${parsed.data.notes??null},${c.get('auth').userId}::uuid,now())`);
  for(const item of parsed.data.items)await c.get('db').execute(sql`insert into purchase_order_items(id,business_id,purchase_order_id,product_id,variant_id,description,quantity,ordered_quantity,unit_cost,total) values(${uuidv7()},${businessId}::uuid,${orderId},${item.productId}::uuid,${item.variantId??null}::uuid,${item.description},${item.quantity},${item.quantity},${item.unitCost},${item.quantity*item.unitCost})`);
  return c.json({data:{id:orderId,status:'ordered',total}},201);
});

procurementRoutes.post('/purchase-orders/:orderId/receive',requirePermission('inventory.write'),async c=>{
  const orderId=id.safeParse(c.req.param('orderId'));
  const parsed=z.object({notes:z.string().max(2000).nullish(),items:z.array(z.object({purchaseOrderItemId:id,quantity:z.coerce.number().finite().positive(),unitCost:z.coerce.number().finite().nonnegative().nullish(),lotCode:z.string().trim().max(120).nullish(),expirationDate:z.iso.date().nullish()})).min(1).max(500)}).safeParse(await c.req.json().catch(()=>null));
  if(!orderId.success||!parsed.success)return error(c,422,'VALIDATION_ERROR','Recebimento inválido');
  try{
    const result=await c.get('db').execute(sql`select receive_purchase_order_transactional(${c.get('auth').businessId}::uuid,${orderId.data}::uuid,${c.get('auth').userId}::uuid,${JSON.stringify(parsed.data.items)}::jsonb,${parsed.data.notes??null}) receipt_id`);
    return c.json({data:{receiptId:rows(result)[0]?.receipt_id,orderId:orderId.data}},201);
  }catch(err){const message=err instanceof Error?err.message:'';if(message.includes('PURCHASE_ORDER_NOT_FOUND'))return error(c,404,'NOT_FOUND','Pedido de compra não encontrado');if(message.includes('PURCHASE_ORDER_NOT_RECEIVABLE'))return error(c,409,'ORDER_NOT_RECEIVABLE','Pedido já recebido ou cancelado');if(message.includes('INVALID_RECEIPT_QUANTITY'))return error(c,409,'INVALID_RECEIPT_QUANTITY','Quantidade recebida supera o saldo do pedido');if(message.includes('INVENTORY_LOCATION_REQUIRED'))return error(c,409,'INVENTORY_LOCATION_REQUIRED','Pedido legado precisa de um local de estoque antes do recebimento');throw err;}
});

procurementRoutes.get('/inventory/costs',requirePermission('inventory.read'),async c=>{
  const result=await c.get('db').execute(sql`select cs.location_id,il.name location_name,cs.product_id,p.name product_name,cs.variant_id,pv.name variant_name,cs.average_cost,cs.quantity_on_hand,cs.updated_at from inventory_cost_state cs join inventory_locations il on il.id=cs.location_id and il.business_id=cs.business_id join products p on p.id=cs.product_id and p.business_id=cs.business_id left join product_variants pv on pv.id=cs.variant_id and pv.business_id=cs.business_id where cs.business_id=${c.get('auth').businessId}::uuid order by p.name,il.name`);
  return c.json({data:rows(result)});
});

procurementRoutes.get('/inventory/cost-layers',requirePermission('inventory.read'),async c=>{
  const method=c.req.query('method')==='fefo'?'fefo':'fifo';
  const result=method==='fefo'
    ? await c.get('db').execute(sql`select * from inventory_cost_layers where business_id=${c.get('auth').businessId}::uuid and remaining_quantity>0 order by expiration_date nulls last,received_at,id`)
    : await c.get('db').execute(sql`select * from inventory_cost_layers where business_id=${c.get('auth').businessId}::uuid and remaining_quantity>0 order by received_at,id`);
  return c.json({data:{method,layers:rows(result)}});
});

procurementRoutes.get('/inventory/expiry-report',requirePermission('inventory.read'),async c=>{
  const days=Math.min(Math.max(Number(c.req.query('days')??30),0),3650);
  const result=await c.get('db').execute(sql`select ib.location_id,il.name location_name,ib.product_id,p.name product_name,ib.variant_id,pv.name variant_name,ib.lot_id,l.lot_code,l.expiration_date,ib.on_hand,ib.reserved from inventory_balances ib join inventory_lots l on l.id=ib.lot_id and l.business_id=ib.business_id join inventory_locations il on il.id=ib.location_id and il.business_id=ib.business_id join products p on p.id=ib.product_id and p.business_id=ib.business_id left join product_variants pv on pv.id=ib.variant_id and pv.business_id=ib.business_id where ib.business_id=${c.get('auth').businessId}::uuid and ib.on_hand>0 and l.expiration_date is not null and l.expiration_date<=current_date+${days}::int order by l.expiration_date,p.name`);
  return c.json({data:{days,items:rows(result)}});
});
