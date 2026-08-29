import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const operationalRoutes = new Hono<ApiEnv>();

const id = z.uuid();
const money = z.coerce.number().finite().nonnegative();
const positiveMoney = z.coerce.number().finite().positive();
const qty = z.coerce.number().finite().positive();
const rows = (result: any) => result?.rows ?? result ?? [];

async function audit(c: any, action: string, entityType: string, entityId: string, beforeJson?: unknown, afterJson?: unknown) {
  await c.get('db').execute(sql`
    insert into audit_logs (id,business_id,actor_user_id,action,entity_type,entity_id,request_id,user_agent,before_json,after_json)
    values (${uuidv7()},${c.get('auth').businessId}::uuid,${c.get('auth').userId}::uuid,${action},${entityType},${entityId}::uuid,${c.get('requestId')},${c.req.header('user-agent')?.slice(0,500) ?? null},${beforeJson ? JSON.stringify(beforeJson) : null}::jsonb,${afterJson ? JSON.stringify(afterJson) : null}::jsonb)
  `);
}

// ORDERS / RESTAURANT / DELIVERY
operationalRoutes.get('/orders', requirePermission('orders.read'), async (c) => {
  const status = c.req.query('status');
  const result = await c.get('db').execute(sql`
    select o.*, c.name customer_name, rt.number table_number,
      coalesce((select jsonb_agg(jsonb_build_object('id',oi.id,'description',oi.description,'quantity',oi.quantity,'unitPrice',oi.unit_price,'total',oi.total,'status',oi.status) order by oi.created_at) from order_items oi where oi.order_id=o.id and oi.business_id=o.business_id),'[]'::jsonb) items
    from orders o left join customers c on c.id=o.customer_id and c.business_id=o.business_id
    left join restaurant_tables rt on rt.id=o.table_id and rt.business_id=o.business_id
    where o.business_id=${c.get('auth').businessId}::uuid and (${status ?? null}::text is null or o.status=${status ?? null})
    order by o.created_at desc limit 200
  `);
  return c.json({ data: rows(result) });
});

const orderCreate = z.object({
  customerId: id.nullish(), unitId: id.nullish(), tableId: id.nullish(),
  channel: z.enum(['counter','table','delivery','pickup','online']).default('counter'),
  notes: z.string().max(2000).nullish(),
  items: z.array(z.object({ productId: id.nullish(), variantId: id.nullish(), serviceId: id.nullish(), description: z.string().min(1).max(300), quantity: qty, unitPrice: money, discount: money.default(0), notes: z.string().max(1000).nullish() })).min(1)
}).strict();

operationalRoutes.post('/orders', requirePermission('orders.write'), async (c) => {
  const parsed = orderCreate.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, 422, 'VALIDATION_ERROR', 'Pedido inválido', parsed.error.flatten());
  const orderId = uuidv7();
  const subtotal = parsed.data.items.reduce((s, item) => s + item.quantity * item.unitPrice, 0);
  const discount = parsed.data.items.reduce((s, item) => s + item.discount, 0);
  const total = Math.max(0, subtotal - discount);
  await c.get('db').execute(sql`
    insert into orders (id,business_id,unit_id,customer_id,table_id,channel,status,subtotal,discount,total,notes,opened_by)
    values (${orderId},${c.get('auth').businessId}::uuid,${parsed.data.unitId ?? null}::uuid,${parsed.data.customerId ?? null}::uuid,${parsed.data.tableId ?? null}::uuid,${parsed.data.channel},'open',${subtotal},${discount},${total},${parsed.data.notes ?? null},${c.get('auth').userId}::uuid)
  `);
  for (const item of parsed.data.items) {
    const itemTotal = Math.max(0, item.quantity * item.unitPrice - item.discount);
    await c.get('db').execute(sql`
      insert into order_items (id,business_id,order_id,product_id,variant_id,service_id,description,quantity,unit_price,discount,total,status,notes)
      values (${uuidv7()},${c.get('auth').businessId}::uuid,${orderId}::uuid,${item.productId ?? null}::uuid,${item.variantId ?? null}::uuid,${item.serviceId ?? null}::uuid,${item.description},${item.quantity},${item.unitPrice},${item.discount},${itemTotal},'pending',${item.notes ?? null})
    `);
  }
  if (parsed.data.tableId) await c.get('db').execute(sql`update restaurant_tables set status='occupied' where id=${parsed.data.tableId}::uuid and business_id=${c.get('auth').businessId}::uuid`);
  await audit(c, 'order.created', 'order', orderId, undefined, { total, channel: parsed.data.channel });
  return c.json({ data: { id: orderId, subtotal, discount, total, status: 'open' } }, 201);
});

operationalRoutes.post('/orders/:orderId/kitchen', requirePermission('orders.write'), async (c) => {
  const orderId = id.safeParse(c.req.param('orderId'));
  if (!orderId.success) return error(c, 422, 'VALIDATION_ERROR', 'Pedido inválido');
  const body = z.object({ station: z.string().max(80).nullish(), priority: z.coerce.number().int().min(0).max(10).default(0) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return error(c, 422, 'VALIDATION_ERROR', 'Dados inválidos');
  const ticketId = uuidv7();
  const created = await c.get('db').execute(sql`
    insert into kitchen_tickets (id,business_id,order_id,station,status,priority)
    select ${ticketId},${c.get('auth').businessId}::uuid,o.id,${body.data.station ?? null},'queued',${body.data.priority}
    from orders o where o.id=${orderId.data}::uuid and o.business_id=${c.get('auth').businessId}::uuid and o.status in ('open','confirmed') returning id
  `);
  if (!rows(created).length) return error(c, 404, 'NOT_FOUND', 'Pedido não encontrado ou já fechado');
  await c.get('db').execute(sql`update orders set status='confirmed',fulfillment_status='preparing',updated_at=now() where id=${orderId.data}::uuid and business_id=${c.get('auth').businessId}::uuid`);
  await audit(c, 'order.sent_to_kitchen', 'order', orderId.data, undefined, { ticketId });
  return c.json({ data: { id: ticketId, status: 'queued' } }, 201);
});

operationalRoutes.patch('/kitchen/:ticketId', requirePermission('orders.write'), async (c) => {
  const ticketId = id.safeParse(c.req.param('ticketId'));
  const body = z.object({ status: z.enum(['queued','preparing','ready','completed','cancelled']) }).safeParse(await c.req.json().catch(() => null));
  if (!ticketId.success || !body.success) return error(c, 422, 'VALIDATION_ERROR', 'Dados inválidos');
  const result = await c.get('db').execute(sql`
    update kitchen_tickets set status=${body.data.status},
      started_at=case when ${body.data.status}='preparing' then coalesce(started_at,now()) else started_at end,
      ready_at=case when ${body.data.status}='ready' then coalesce(ready_at,now()) else ready_at end,
      completed_at=case when ${body.data.status}='completed' then coalesce(completed_at,now()) else completed_at end
    where id=${ticketId.data}::uuid and business_id=${c.get('auth').businessId}::uuid returning id,order_id,status
  `);
  const ticket = rows(result)[0];
  if (!ticket) return error(c, 404, 'NOT_FOUND', 'Ticket não encontrado');
  if (body.data.status === 'ready') await c.get('db').execute(sql`update orders set fulfillment_status='ready',updated_at=now() where id=${ticket.order_id}::uuid and business_id=${c.get('auth').businessId}::uuid`);
  return c.json({ data: ticket });
});

operationalRoutes.post('/orders/:orderId/payments', requirePermission('sales.create'), async (c) => {
  const orderId = id.safeParse(c.req.param('orderId'));
  const body = z.object({ method: z.string().min(1).max(40), amount: positiveMoney, paymentMethodId: id.nullish(), provider: z.string().max(80).nullish(), externalReference: z.string().max(180).nullish() }).safeParse(await c.req.json().catch(() => null));
  if (!orderId.success || !body.success) return error(c, 422, 'VALIDATION_ERROR', 'Pagamento inválido');
  const paymentId = uuidv7();
  const inserted = await c.get('db').execute(sql`
    insert into order_payments (id,business_id,order_id,payment_method_id,method,amount,status,provider,external_reference,paid_at)
    select ${paymentId},${c.get('auth').businessId}::uuid,o.id,${body.data.paymentMethodId ?? null}::uuid,${body.data.method},${body.data.amount},'paid',${body.data.provider ?? null},${body.data.externalReference ?? null},now()
    from orders o where o.id=${orderId.data}::uuid and o.business_id=${c.get('auth').businessId}::uuid and o.status not in ('closed','cancelled') returning id
  `);
  if (!rows(inserted).length) return error(c, 404, 'NOT_FOUND', 'Pedido não encontrado ou fechado');
  const totals = await c.get('db').execute(sql`select o.total,coalesce(sum(p.amount) filter(where p.status='paid'),0) paid from orders o left join order_payments p on p.order_id=o.id and p.business_id=o.business_id where o.id=${orderId.data}::uuid and o.business_id=${c.get('auth').businessId}::uuid group by o.total`);
  const t: any = rows(totals)[0];
  if (t && Number(t.paid) >= Number(t.total)) await c.get('db').execute(sql`update orders set payment_status='paid',updated_at=now() where id=${orderId.data}::uuid and business_id=${c.get('auth').businessId}::uuid`);
  await audit(c, 'order.payment.created', 'order', orderId.data, undefined, { paymentId, amount: body.data.amount, method: body.data.method });
  return c.json({ data: { id: paymentId, orderId: orderId.data, status: 'paid' } }, 201);
});

operationalRoutes.post('/orders/:orderId/close', requirePermission('orders.write'), async (c) => {
  const orderId = id.safeParse(c.req.param('orderId'));
  if (!orderId.success) return error(c, 422, 'VALIDATION_ERROR', 'Pedido inválido');
  const orderResult = await c.get('db').execute(sql`select id,table_id,total,payment_status,status from orders where id=${orderId.data}::uuid and business_id=${c.get('auth').businessId}::uuid limit 1`);
  const order: any = rows(orderResult)[0];
  if (!order) return error(c, 404, 'NOT_FOUND', 'Pedido não encontrado');
  if (order.payment_status !== 'paid') return error(c, 409, 'PAYMENT_PENDING', 'O pedido precisa estar pago antes do fechamento');
  await c.get('db').execute(sql`update orders set status='closed',fulfillment_status='completed',closed_by=${c.get('auth').userId}::uuid,closed_at=now(),updated_at=now() where id=${orderId.data}::uuid and business_id=${c.get('auth').businessId}::uuid`);
  if (order.table_id) await c.get('db').execute(sql`update restaurant_tables set status='available' where id=${order.table_id}::uuid and business_id=${c.get('auth').businessId}::uuid`);
  await audit(c, 'order.closed', 'order', orderId.data, { status: order.status }, { status: 'closed' });
  return c.json({ data: { id: orderId.data, status: 'closed' } });
});

// FINANCE / CASH
operationalRoutes.get('/finance/summary', requirePermission('finance.read'), async (c) => {
  const result = await c.get('db').execute(sql`
    select
      coalesce((select sum(amount-paid_amount) from payables where business_id=${c.get('auth').businessId}::uuid and status not in ('paid','cancelled')),0) payable_open,
      coalesce((select sum(amount-received_amount) from receivables where business_id=${c.get('auth').businessId}::uuid and status not in ('received','cancelled')),0) receivable_open,
      coalesce((select sum(case when movement_type in ('sale','supply','income') then amount else -amount end) from cash_movements where business_id=${c.get('auth').businessId}::uuid),0) cash_net,
      coalesce((select sum(amount) from commissions where business_id=${c.get('auth').businessId}::uuid and status='pending'),0) commissions_pending
  `);
  return c.json({ data: rows(result)[0] ?? {} });
});

const accountSchema = z.object({ description: z.string().min(1).max(300), amount: positiveMoney, dueDate: z.iso.date(), categoryId: id.nullish(), notes: z.string().max(2000).nullish(), customerId: id.nullish(), supplierId: id.nullish() }).strict();
operationalRoutes.post('/finance/payables', requirePermission('finance.create'), async (c) => {
  const p = accountSchema.safeParse(await c.req.json().catch(() => null)); if (!p.success) return error(c,422,'VALIDATION_ERROR','Conta inválida',p.error.flatten());
  const recordId=uuidv7(); await c.get('db').execute(sql`insert into payables(id,business_id,supplier_id,description,amount,due_date,status,category_id,notes) values(${recordId},${c.get('auth').businessId}::uuid,${p.data.supplierId??null}::uuid,${p.data.description},${p.data.amount},${p.data.dueDate}::date,'pending',${p.data.categoryId??null}::uuid,${p.data.notes??null})`);
  await audit(c,'finance.payable.created','payable',recordId,undefined,p.data); return c.json({data:{id:recordId,status:'pending'}},201);
});
operationalRoutes.post('/finance/receivables', requirePermission('finance.create'), async (c) => {
  const p = accountSchema.safeParse(await c.req.json().catch(() => null)); if (!p.success) return error(c,422,'VALIDATION_ERROR','Conta inválida',p.error.flatten());
  const recordId=uuidv7(); await c.get('db').execute(sql`insert into receivables(id,business_id,customer_id,description,amount,due_date,status,category_id,notes) values(${recordId},${c.get('auth').businessId}::uuid,${p.data.customerId??null}::uuid,${p.data.description},${p.data.amount},${p.data.dueDate}::date,'pending',${p.data.categoryId??null}::uuid,${p.data.notes??null})`);
  await audit(c,'finance.receivable.created','receivable',recordId,undefined,p.data); return c.json({data:{id:recordId,status:'pending'}},201);
});

operationalRoutes.post('/cash/open', requirePermission('cash.open'), async (c) => {
  const p=z.object({unitId:id.nullish(),openingAmount:money.default(0)}).safeParse(await c.req.json().catch(()=>({}))); if(!p.success)return error(c,422,'VALIDATION_ERROR','Caixa inválido');
  const existing=await c.get('db').execute(sql`select id from cash_sessions where business_id=${c.get('auth').businessId}::uuid and opened_by=${c.get('auth').userId}::uuid and status='open' limit 1`); if(rows(existing).length)return error(c,409,'CASH_ALREADY_OPEN','Já existe um caixa aberto para este usuário');
  const sessionId=uuidv7(); await c.get('db').execute(sql`insert into cash_sessions(id,business_id,unit_id,opened_by,opening_amount,status) values(${sessionId},${c.get('auth').businessId}::uuid,${p.data.unitId??null}::uuid,${c.get('auth').userId}::uuid,${p.data.openingAmount},'open')`);
  await audit(c,'cash.opened','cash_session',sessionId,undefined,p.data); return c.json({data:{id:sessionId,status:'open'}},201);
});

operationalRoutes.post('/cash/:sessionId/movements', requirePermission('cash.adjust'), async (c) => {
  const sessionId=id.safeParse(c.req.param('sessionId')); const p=z.object({type:z.enum(['withdrawal','supply','adjustment','expense','income']),amount:positiveMoney,description:z.string().max(500).nullish()}).safeParse(await c.req.json().catch(()=>null)); if(!sessionId.success||!p.success)return error(c,422,'VALIDATION_ERROR','Movimento inválido');
  const movementId=uuidv7(); const inserted=await c.get('db').execute(sql`insert into cash_movements(id,business_id,cash_session_id,movement_type,amount,description,created_by) select ${movementId},${c.get('auth').businessId}::uuid,cs.id,${p.data.type},${p.data.amount},${p.data.description??null},${c.get('auth').userId}::uuid from cash_sessions cs where cs.id=${sessionId.data}::uuid and cs.business_id=${c.get('auth').businessId}::uuid and cs.status='open' returning id`); if(!rows(inserted).length)return error(c,409,'CASH_NOT_OPEN','Caixa não encontrado ou fechado');
  await audit(c,`cash.${p.data.type}`,'cash_session',sessionId.data,undefined,{movementId,amount:p.data.amount}); return c.json({data:{id:movementId}},201);
});

operationalRoutes.post('/cash/:sessionId/close', requirePermission('cash.close'), async (c) => {
  const sessionId=id.safeParse(c.req.param('sessionId')); const p=z.object({closingAmount:money}).safeParse(await c.req.json().catch(()=>null)); if(!sessionId.success||!p.success)return error(c,422,'VALIDATION_ERROR','Fechamento inválido');
  const updated=await c.get('db').execute(sql`update cash_sessions set status='closed',closing_amount=${p.data.closingAmount},closed_by=${c.get('auth').userId}::uuid,closed_at=now() where id=${sessionId.data}::uuid and business_id=${c.get('auth').businessId}::uuid and status='open' returning id,opening_amount,closing_amount`); if(!rows(updated).length)return error(c,404,'NOT_FOUND','Caixa aberto não encontrado');
  await audit(c,'cash.closed','cash_session',sessionId.data,undefined,{closingAmount:p.data.closingAmount}); return c.json({data:rows(updated)[0]});
});

// INVENTORY
operationalRoutes.get('/inventory/balances', requirePermission('inventory.read'), async (c) => {
  const result=await c.get('db').execute(sql`select b.*,p.name product_name,v.name variant_name,l.lot_code,loc.name location_name,(b.on_hand-b.reserved) available from inventory_balances b join products p on p.id=b.product_id and p.business_id=b.business_id left join product_variants v on v.id=b.variant_id left join inventory_lots l on l.id=b.lot_id join inventory_locations loc on loc.id=b.location_id where b.business_id=${c.get('auth').businessId}::uuid order by p.name`); return c.json({data:rows(result)});
});

operationalRoutes.post('/inventory/movements', requirePermission('inventory.write'), async (c) => {
  const p=z.object({locationId:id,productId:id,variantId:id.nullish(),lotId:id.nullish(),type:z.enum(['purchase','sale','adjustment_in','adjustment_out','transfer_in','transfer_out','return']),quantity:qty,unitCost:money.nullish(),referenceType:z.string().max(80).nullish(),referenceId:id.nullish(),notes:z.string().max(1000).nullish()}).safeParse(await c.req.json().catch(()=>null)); if(!p.success)return error(c,422,'VALIDATION_ERROR','Movimento de estoque inválido',p.error.flatten());
  const signed=['sale','adjustment_out','transfer_out'].includes(p.data.type)?-p.data.quantity:p.data.quantity;
  const current=await c.get('db').execute(sql`select on_hand,reserved from inventory_balances where business_id=${c.get('auth').businessId}::uuid and location_id=${p.data.locationId}::uuid and product_id=${p.data.productId}::uuid and variant_id is not distinct from ${p.data.variantId??null}::uuid and lot_id is not distinct from ${p.data.lotId??null}::uuid limit 1`); const balance:any=rows(current)[0];
  if(signed<0 && (!balance || Number(balance.on_hand)+signed<Number(balance.reserved))) return error(c,409,'INSUFFICIENT_STOCK','Saldo disponível insuficiente');
  if(balance) await c.get('db').execute(sql`update inventory_balances set on_hand=on_hand+${signed},updated_at=now() where business_id=${c.get('auth').businessId}::uuid and location_id=${p.data.locationId}::uuid and product_id=${p.data.productId}::uuid and variant_id is not distinct from ${p.data.variantId??null}::uuid and lot_id is not distinct from ${p.data.lotId??null}::uuid`);
  else await c.get('db').execute(sql`insert into inventory_balances(business_id,location_id,product_id,variant_id,lot_id,on_hand,reserved) values(${c.get('auth').businessId}::uuid,${p.data.locationId}::uuid,${p.data.productId}::uuid,${p.data.variantId??null}::uuid,${p.data.lotId??null}::uuid,${signed},0)`);
  const movementId=uuidv7(); await c.get('db').execute(sql`insert into inventory_movements(id,business_id,product_id,movement_type,quantity,reference_type,reference_id,created_by,location_id,variant_id,lot_id,unit_cost,notes) values(${movementId},${c.get('auth').businessId}::uuid,${p.data.productId}::uuid,${p.data.type},${signed},${p.data.referenceType??null},${p.data.referenceId??null}::uuid,${c.get('auth').userId}::uuid,${p.data.locationId}::uuid,${p.data.variantId??null}::uuid,${p.data.lotId??null}::uuid,${p.data.unitCost??null},${p.data.notes??null})`);
  await audit(c,'inventory.movement.created','inventory_movement',movementId,undefined,{...p.data,signedQuantity:signed}); return c.json({data:{id:movementId,quantity:signed}},201);
});

// SERVICE ORDERS
operationalRoutes.get('/service-orders', requirePermission('service_orders.read'), async (c) => {
  const result=await c.get('db').execute(sql`select so.*,c.name customer_name,u.name technician_name,coalesce((select jsonb_agg(e order by e.created_at) from service_order_events e where e.service_order_id=so.id and e.business_id=so.business_id),'[]'::jsonb) events from service_orders so left join customers c on c.id=so.customer_id and c.business_id=so.business_id left join users u on u.id=so.assigned_technician_id where so.business_id=${c.get('auth').businessId}::uuid order by so.opened_at desc limit 200`); return c.json({data:rows(result)});
});

operationalRoutes.post('/service-orders', requirePermission('service_orders.write'), async (c) => {
  const p=z.object({customerId:id.nullish(),subject:z.string().max(300).nullish(),equipmentType:z.string().max(120).nullish(),brand:z.string().max(120).nullish(),model:z.string().max(120).nullish(),serialNumber:z.string().max(180).nullish(),problemReported:z.string().min(1).max(5000),technicianId:id.nullish(),estimatedValue:money.nullish()}).safeParse(await c.req.json().catch(()=>null)); if(!p.success)return error(c,422,'VALIDATION_ERROR','OS inválida',p.error.flatten());
  const n=await c.get('db').execute(sql`select coalesce(max(number),0)+1 next from service_orders where business_id=${c.get('auth').businessId}::uuid`); const number=Number((rows(n)[0] as any)?.next??1); const osId=uuidv7();
  await c.get('db').execute(sql`insert into service_orders(id,business_id,customer_id,number,subject,equipment_type,brand,model,serial_number,problem_reported,status,estimated_value,assigned_technician_id) values(${osId},${c.get('auth').businessId}::uuid,${p.data.customerId??null}::uuid,${number},${p.data.subject??null},${p.data.equipmentType??null},${p.data.brand??null},${p.data.model??null},${p.data.serialNumber??null},${p.data.problemReported},'opened',${p.data.estimatedValue??null},${p.data.technicianId??null}::uuid)`);
  await c.get('db').execute(sql`insert into service_order_events(id,business_id,service_order_id,event_type,status,notes,actor_user_id) values(${uuidv7()},${c.get('auth').businessId}::uuid,${osId},'created','opened',${p.data.problemReported},${c.get('auth').userId}::uuid)`); await audit(c,'service_order.created','service_order',osId,undefined,{number}); return c.json({data:{id:osId,number,status:'opened'}},201);
});

operationalRoutes.patch('/service-orders/:osId/status', requirePermission('service_orders.write'), async (c) => {
  const osId=id.safeParse(c.req.param('osId')); const p=z.object({status:z.enum(['opened','diagnosing','awaiting_approval','approved','in_progress','ready','completed','delivered','cancelled']),notes:z.string().max(3000).nullish(),finalValue:money.nullish(),warrantyUntil:z.iso.date().nullish()}).safeParse(await c.req.json().catch(()=>null)); if(!osId.success||!p.success)return error(c,422,'VALIDATION_ERROR','Atualização inválida');
  const before=await c.get('db').execute(sql`select status from service_orders where id=${osId.data}::uuid and business_id=${c.get('auth').businessId}::uuid`); if(!rows(before).length)return error(c,404,'NOT_FOUND','OS não encontrada');
  await c.get('db').execute(sql`update service_orders set status=${p.data.status},final_value=coalesce(${p.data.finalValue??null},final_value),warranty_until=coalesce(${p.data.warrantyUntil??null}::date,warranty_until),completed_at=case when ${p.data.status}='completed' then now() else completed_at end,picked_up_at=case when ${p.data.status}='delivered' then now() else picked_up_at end where id=${osId.data}::uuid and business_id=${c.get('auth').businessId}::uuid`);
  await c.get('db').execute(sql`insert into service_order_events(id,business_id,service_order_id,event_type,status,notes,actor_user_id) values(${uuidv7()},${c.get('auth').businessId}::uuid,${osId.data}::uuid,'status_changed',${p.data.status},${p.data.notes??null},${c.get('auth').userId}::uuid)`); await audit(c,'service_order.status_changed','service_order',osId.data,rows(before)[0],{status:p.data.status}); return c.json({data:{id:osId.data,status:p.data.status}});
});

// CLINIC
operationalRoutes.get('/patients', requirePermission('patients.read'), async (c) => { const result=await c.get('db').execute(sql`select id,customer_id,name,document_number,birth_date,phone,email,active,created_at,updated_at from patients where business_id=${c.get('auth').businessId}::uuid order by name limit 300`); return c.json({data:rows(result)}); });
operationalRoutes.post('/patients', requirePermission('patients.write'), async (c) => {
  const p=z.object({customerId:id.nullish(),name:z.string().min(2).max(200),documentNumber:z.string().max(30).nullish(),birthDate:z.iso.date().nullish(),phone:z.string().max(30).nullish(),email:z.email().nullish(),allergies:z.string().max(3000).nullish(),notes:z.string().max(5000).nullish()}).safeParse(await c.req.json().catch(()=>null)); if(!p.success)return error(c,422,'VALIDATION_ERROR','Paciente inválido',p.error.flatten()); const patientId=uuidv7();
  await c.get('db').execute(sql`insert into patients(id,business_id,customer_id,name,document_number,birth_date,phone,email,allergies,notes) values(${patientId},${c.get('auth').businessId}::uuid,${p.data.customerId??null}::uuid,${p.data.name},${p.data.documentNumber??null},${p.data.birthDate??null}::date,${p.data.phone??null},${p.data.email??null},${p.data.allergies??null},${p.data.notes??null})`); await audit(c,'patient.created','patient',patientId,undefined,{name:p.data.name}); return c.json({data:{id:patientId}},201);
});
operationalRoutes.get('/patients/:patientId/records', requirePermission('patients.sensitive.read'), async (c) => { const patientId=id.safeParse(c.req.param('patientId')); if(!patientId.success)return error(c,422,'VALIDATION_ERROR','Paciente inválido'); const result=await c.get('db').execute(sql`select cr.*,p.display_name professional_name from clinical_records cr left join professionals p on p.id=cr.professional_id where cr.business_id=${c.get('auth').businessId}::uuid and cr.patient_id=${patientId.data}::uuid order by cr.created_at desc`); await audit(c,'clinical_record.read','patient',patientId.data); return c.json({data:rows(result)}); });
operationalRoutes.post('/patients/:patientId/records', requirePermission('patients.write'), async (c) => { const patientId=id.safeParse(c.req.param('patientId')); const p=z.object({professionalId:id.nullish(),recordType:z.string().min(1).max(80),title:z.string().min(1).max(300),content:z.record(z.string(),z.unknown())}).safeParse(await c.req.json().catch(()=>null)); if(!patientId.success||!p.success)return error(c,422,'VALIDATION_ERROR','Prontuário inválido'); const recordId=uuidv7(); const inserted=await c.get('db').execute(sql`insert into clinical_records(id,business_id,patient_id,professional_id,record_type,title,content_json,created_by) select ${recordId},${c.get('auth').businessId}::uuid,p.id,${p.data.professionalId??null}::uuid,${p.data.recordType},${p.data.title},${JSON.stringify(p.data.content)}::jsonb,${c.get('auth').userId}::uuid from patients p where p.id=${patientId.data}::uuid and p.business_id=${c.get('auth').businessId}::uuid returning id`); if(!rows(inserted).length)return error(c,404,'NOT_FOUND','Paciente não encontrado'); await audit(c,'clinical_record.created','clinical_record',recordId,undefined,{patientId:patientId.data,recordType:p.data.recordType}); return c.json({data:{id:recordId}},201); });

// GYM / STUDIO
operationalRoutes.get('/enrollments', requirePermission('customers.read'), async (c) => { const result=await c.get('db').execute(sql`select e.*,c.name customer_name,mp.name plan_name,mp.price plan_price from enrollments e join customers c on c.id=e.customer_id and c.business_id=e.business_id join membership_plans mp on mp.id=e.plan_id and mp.business_id=e.business_id where e.business_id=${c.get('auth').businessId}::uuid order by e.created_at desc`); return c.json({data:rows(result)}); });
operationalRoutes.post('/enrollments', requirePermission('customers.update'), async (c) => { const p=z.object({customerId:id,planId:id,startsOn:z.iso.date(),endsOn:z.iso.date().nullish(),nextDueDate:z.iso.date().nullish()}).safeParse(await c.req.json().catch(()=>null)); if(!p.success)return error(c,422,'VALIDATION_ERROR','Matrícula inválida'); const enrollmentId=uuidv7(); const inserted=await c.get('db').execute(sql`insert into enrollments(id,business_id,customer_id,plan_id,status,starts_on,ends_on,next_due_date) select ${enrollmentId},${c.get('auth').businessId}::uuid,c.id,mp.id,'active',${p.data.startsOn}::date,${p.data.endsOn??null}::date,${p.data.nextDueDate??null}::date from customers c join membership_plans mp on mp.id=${p.data.planId}::uuid and mp.business_id=c.business_id where c.id=${p.data.customerId}::uuid and c.business_id=${c.get('auth').businessId}::uuid returning id`); if(!rows(inserted).length)return error(c,404,'NOT_FOUND','Cliente ou plano não encontrado'); await audit(c,'enrollment.created','enrollment',enrollmentId,undefined,p.data); return c.json({data:{id:enrollmentId,status:'active'}},201); });
operationalRoutes.post('/checkins', requirePermission('customers.update'), async (c) => { const p=z.object({enrollmentId:id,classId:id.nullish(),source:z.enum(['staff','qr','app','turnstile']).default('staff')}).safeParse(await c.req.json().catch(()=>null)); if(!p.success)return error(c,422,'VALIDATION_ERROR','Check-in inválido'); const enrollment=await c.get('db').execute(sql`select id,status,ends_on from enrollments where id=${p.data.enrollmentId}::uuid and business_id=${c.get('auth').businessId}::uuid limit 1`); const e:any=rows(enrollment)[0]; if(!e||e.status!=='active'||(e.ends_on&&new Date(e.ends_on)<new Date()))return error(c,409,'ENROLLMENT_INACTIVE','Matrícula inativa ou vencida'); const checkinId=uuidv7(); await c.get('db').execute(sql`insert into checkins(id,business_id,enrollment_id,class_id,source,created_by) values(${checkinId},${c.get('auth').businessId}::uuid,${p.data.enrollmentId}::uuid,${p.data.classId??null}::uuid,${p.data.source},${c.get('auth').userId}::uuid)`); return c.json({data:{id:checkinId,checkedIn:true}},201); });
