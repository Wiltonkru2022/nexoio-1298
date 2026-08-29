import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const technicalServiceRoutes=new Hono<ApiEnv>();
const id=z.uuid();
const rows=(result:any)=>result?.rows??result??[];

technicalServiceRoutes.get('/service-orders/:osId/workspace',requirePermission('service_orders.read'),async c=>{
  const parsed=id.safeParse(c.req.param('osId'));if(!parsed.success)return error(c,422,'VALIDATION_ERROR','OS inválida');
  const businessId=c.get('auth').businessId;
  const osResult=await c.get('db').execute(sql`
    select so.*,cu.name customer_name,
      case when ce.id is null then null else jsonb_build_object('id',ce.id,'equipmentType',ce.equipment_type,'brand',ce.brand,'model',ce.model,'serialNumber',ce.serial_number,'identifier',ce.identifier,'notes',ce.notes,'active',ce.active) end equipment
    from service_orders so
    left join customers cu on cu.id=so.customer_id and cu.business_id=so.business_id
    left join customer_equipment ce on ce.id=so.equipment_id and ce.business_id=so.business_id
    where so.id=${parsed.data}::uuid and so.business_id=${businessId}::uuid limit 1
  `);
  const os:any=rows(osResult)[0];if(!os)return error(c,404,'NOT_FOUND','OS não encontrada');
  const[quoteResult,partsResult,paymentsResult,warrantiesResult,equipmentResult]=await Promise.all([
    c.get('db').execute(sql`select q.*,coalesce((select jsonb_agg(jsonb_build_object('id',qi.id,'itemType',qi.item_type,'productId',qi.product_id,'serviceId',qi.service_id,'description',qi.description,'quantity',qi.quantity,'unitPrice',qi.unit_price,'total',qi.total) order by qi.id) from quote_items qi where qi.quote_id=q.id and qi.business_id=q.business_id),'[]'::jsonb) items from quotes q where q.service_order_id=${parsed.data}::uuid and q.business_id=${businessId}::uuid order by q.created_at desc`),
    c.get('db').execute(sql`select sop.*,p.name product_name from service_order_parts sop left join products p on p.id=sop.product_id and p.business_id=sop.business_id where sop.service_order_id=${parsed.data}::uuid and sop.business_id=${businessId}::uuid order by sop.id`),
    c.get('db').execute(sql`select id,method,amount,status,paid_at,created_at from service_order_payments where service_order_id=${parsed.data}::uuid and business_id=${businessId}::uuid order by created_at desc`),
    c.get('db').execute(sql`select * from service_warranties where service_order_id=${parsed.data}::uuid and business_id=${businessId}::uuid order by created_at desc`),
    os.customer_id?c.get('db').execute(sql`select ce.*,coalesce((select count(*)::int from service_orders x where x.business_id=ce.business_id and x.equipment_id=ce.id),0) service_order_count from customer_equipment ce where ce.customer_id=${os.customer_id}::uuid and ce.business_id=${businessId}::uuid order by ce.active desc,ce.created_at desc`):Promise.resolve({rows:[]})
  ]);
  return c.json({data:{order:os,quotes:rows(quoteResult),parts:rows(partsResult),payments:rows(paymentsResult),warranties:rows(warrantiesResult),customerEquipment:rows(equipmentResult)}});
});

technicalServiceRoutes.get('/technical/equipment',requirePermission('service_orders.read'),async c=>{
  const businessId=c.get('auth').businessId;const customerId=c.req.query('customerId');
  if(customerId&&!id.safeParse(customerId).success)return error(c,422,'VALIDATION_ERROR','Cliente inválido');
  const result=await c.get('db').execute(sql`select ce.*,cu.name customer_name,coalesce((select count(*)::int from service_orders so where so.business_id=ce.business_id and so.equipment_id=ce.id),0) service_order_count from customer_equipment ce join customers cu on cu.id=ce.customer_id and cu.business_id=ce.business_id where ce.business_id=${businessId}::uuid and (${customerId??null}::uuid is null or ce.customer_id=${customerId??null}::uuid) order by ce.active desc,cu.name,ce.created_at desc`);
  return c.json({data:rows(result)});
});

technicalServiceRoutes.post('/technical/equipment',requirePermission('service_orders.write'),async c=>{
  const parsed=z.object({customerId:id,equipmentType:z.string().trim().min(1).max(120),brand:z.string().trim().max(120).nullish(),model:z.string().trim().max(120).nullish(),serialNumber:z.string().trim().max(180).nullish(),identifier:z.string().trim().max(180).nullish(),notes:z.string().trim().max(3000).nullish()}).safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return error(c,422,'VALIDATION_ERROR','Equipamento inválido',parsed.error.flatten());
  const businessId=c.get('auth').businessId,recordId=uuidv7();
  const inserted=await c.get('db').execute(sql`insert into customer_equipment(id,business_id,customer_id,equipment_type,brand,model,serial_number,identifier,notes,active) select ${recordId},${businessId}::uuid,c.id,${parsed.data.equipmentType},${parsed.data.brand??null},${parsed.data.model??null},${parsed.data.serialNumber??null},${parsed.data.identifier??null},${parsed.data.notes??null},true from customers c where c.id=${parsed.data.customerId}::uuid and c.business_id=${businessId}::uuid returning *`);
  if(!rows(inserted).length)return error(c,404,'CUSTOMER_NOT_FOUND','Cliente não encontrado');
  return c.json({data:rows(inserted)[0]},201);
});

technicalServiceRoutes.patch('/service-orders/:osId/equipment',requirePermission('service_orders.write'),async c=>{
  const osId=id.safeParse(c.req.param('osId'));const parsed=z.object({equipmentId:id}).safeParse(await c.req.json().catch(()=>null));if(!osId.success||!parsed.success)return error(c,422,'VALIDATION_ERROR','Equipamento inválido');
  const businessId=c.get('auth').businessId;
  const updated=await c.get('db').execute(sql`update service_orders so set equipment_id=ce.id,equipment_type=ce.equipment_type,brand=ce.brand,model=ce.model,serial_number=ce.serial_number from customer_equipment ce where so.id=${osId.data}::uuid and so.business_id=${businessId}::uuid and ce.id=${parsed.data.equipmentId}::uuid and ce.business_id=so.business_id and ce.customer_id=so.customer_id returning so.id`);
  if(!rows(updated).length)return error(c,409,'EQUIPMENT_CUSTOMER_MISMATCH','O equipamento precisa pertencer ao cliente da OS');
  await c.get('db').execute(sql`insert into service_order_events(id,business_id,service_order_id,event_type,status,notes,actor_user_id) values(${uuidv7()},${businessId}::uuid,${osId.data}::uuid,'equipment_linked',null,'Equipamento do cliente vinculado à OS',${c.get('auth').userId}::uuid)`);
  return c.json({data:{id:osId.data,equipmentId:parsed.data.equipmentId}});
});

technicalServiceRoutes.post('/service-orders/:osId/parts',requirePermission('service_orders.write'),async c=>{
  const osId=id.safeParse(c.req.param('osId'));const parsed=z.object({productId:id.nullish(),locationId:id.nullish(),description:z.string().trim().min(1).max(300),quantity:z.coerce.number().finite().positive(),unitCost:z.coerce.number().finite().nonnegative().nullish(),unitPrice:z.coerce.number().finite().nonnegative()}).safeParse(await c.req.json().catch(()=>null));
  if(!osId.success||!parsed.success)return error(c,422,'VALIDATION_ERROR','Peça inválida',parsed.success?undefined:parsed.error.flatten());
  try{
    const result=await c.get('db').execute(sql`select * from add_service_order_part_transactional(${c.get('auth').businessId}::uuid,${c.get('auth').userId}::uuid,${osId.data}::uuid,${parsed.data.productId??null}::uuid,${parsed.data.locationId??null}::uuid,${parsed.data.description},${parsed.data.quantity},${parsed.data.unitCost??null},${parsed.data.unitPrice})`);
    return c.json({data:rows(result)[0]},201);
  }catch(reason){
    const message=reason instanceof Error?reason.message:String(reason);
    if(message.includes('INSUFFICIENT_STOCK'))return error(c,409,'INSUFFICIENT_STOCK','Estoque insuficiente para aplicar esta peça');
    if(message.includes('INVENTORY_LOCATION_REQUIRED'))return error(c,409,'INVENTORY_LOCATION_REQUIRED','Cadastre um local de estoque antes de aplicar a peça');
    if(message.includes('INVENTORY_LOCATION_NOT_FOUND'))return error(c,404,'INVENTORY_LOCATION_NOT_FOUND','Local de estoque não encontrado');
    if(message.includes('SERVICE_ORDER_NOT_OPEN'))return error(c,409,'SERVICE_ORDER_NOT_OPEN','A OS está encerrada e não aceita novas peças');
    if(message.includes('PRODUCT_NOT_FOUND'))return error(c,404,'PRODUCT_NOT_FOUND','Produto/peça não encontrado');
    throw reason;
  }
});
