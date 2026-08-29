import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidv7 } from '@nexoio/core';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const restaurantMenuRoutes = new Hono<ApiEnv>();
const rows=(r:any)=>r?.rows??r??[];
const id=z.uuid();
const MAX_FILE_BYTES=10*1024*1024;
const imageTypes=new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif']);
const productBody=z.object({
  name:z.string().trim().min(2).max(200),
  sku:z.string().trim().max(80).nullish(),
  description:z.string().trim().max(5000).nullish(),
  salePrice:z.coerce.number().finite().min(0),
  minimumStock:z.coerce.number().finite().min(0).default(0),
  active:z.boolean().default(true)
}).strict();

restaurantMenuRoutes.get('/menu/products',requirePermission('orders.read'),async c=>{
  const origin=new URL(c.req.url).origin;
  const r=await c.get('db').execute(sql`
    select p.id,p.name,p.sku,p.description,p.sale_price,p.minimum_stock,p.active,p.primary_image_file_id,
      case when p.primary_image_file_id is not null then ${origin} || '/api/public/media/' || p.primary_image_file_id::text else null end image_url
    from products p
    where p.business_id=${c.get('auth').businessId}::uuid
    order by p.active desc,p.name asc
  `);
  return c.json({data:rows(r)});
});

restaurantMenuRoutes.post('/menu/products',requirePermission('orders.write'),async c=>{
  const p=productBody.safeParse(await c.req.json().catch(()=>null));
  if(!p.success)return error(c,422,'VALIDATION_ERROR','Item do cardápio inválido',p.error.flatten());
  const productId=uuidv7();
  await c.get('db').execute(sql`
    insert into products(id,business_id,sku,name,description,sale_price,stock_control_enabled,minimum_stock,active)
    values(${productId},${c.get('auth').businessId}::uuid,${p.data.sku||null},${p.data.name},${p.data.description||null},${p.data.salePrice},true,${p.data.minimumStock},${p.data.active})
  `);
  return c.json({data:{id:productId,...p.data,imageUrl:null}},201);
});

restaurantMenuRoutes.patch('/menu/products/:id',requirePermission('orders.write'),async c=>{
  const productId=id.safeParse(c.req.param('id'));
  const p=productBody.partial().refine(v=>Object.keys(v).length>0).safeParse(await c.req.json().catch(()=>null));
  if(!productId.success||!p.success)return error(c,422,'VALIDATION_ERROR','Item do cardápio inválido');
  const current:any=rows(await c.get('db').execute(sql`select * from products where id=${productId.success?productId.data:null}::uuid and business_id=${c.get('auth').businessId}::uuid limit 1`))[0];
  if(!current)return error(c,404,'NOT_FOUND','Item não encontrado');
  const d=p.data;
  const r=await c.get('db').execute(sql`
    update products set
      name=${d.name??current.name},
      sku=${d.sku===undefined?current.sku:(d.sku||null)},
      description=${d.description===undefined?current.description:(d.description||null)},
      sale_price=${d.salePrice??Number(current.sale_price)},
      minimum_stock=${d.minimumStock??Number(current.minimum_stock??0)},
      active=${d.active??current.active},
      updated_at=now()
    where id=${productId.data}::uuid and business_id=${c.get('auth').businessId}::uuid
    returning id,name,sku,description,sale_price,minimum_stock,active,primary_image_file_id
  `);
  return c.json({data:rows(r)[0]});
});

restaurantMenuRoutes.delete('/menu/products/:id',requirePermission('orders.write'),async c=>{
  const productId=id.safeParse(c.req.param('id'));
  if(!productId.success)return error(c,422,'VALIDATION_ERROR','Item inválido');
  const r=await c.get('db').execute(sql`update products set active=false,updated_at=now() where id=${productId.data}::uuid and business_id=${c.get('auth').businessId}::uuid returning id`);
  if(!rows(r).length)return error(c,404,'NOT_FOUND','Item não encontrado');
  return c.json({data:{id:productId.data,active:false}});
});

restaurantMenuRoutes.post('/menu/products/:id/image',requirePermission('orders.write'),async c=>{
  const productId=id.safeParse(c.req.param('id'));
  if(!productId.success)return error(c,422,'VALIDATION_ERROR','Item inválido');
  const product:any=rows(await c.get('db').execute(sql`select id,primary_image_file_id from products where id=${productId.data}::uuid and business_id=${c.get('auth').businessId}::uuid limit 1`))[0];
  if(!product)return error(c,404,'NOT_FOUND','Item não encontrado');
  const form=await c.req.formData().catch(()=>null);const file=form?.get('file');
  if(!(file instanceof File))return error(c,422,'VALIDATION_ERROR','Imagem obrigatória');
  if(file.size<=0||file.size>MAX_FILE_BYTES)return error(c,413,'FILE_TOO_LARGE','A imagem deve ter no máximo 10 MB');
  if(!imageTypes.has(file.type))return error(c,415,'UNSUPPORTED_MEDIA_TYPE','Use JPG, PNG, WEBP, GIF ou AVIF');
  const businessId=c.get('auth').businessId,db=c.get('db');
  const quota=await db.execute(sql`select coalesce(sum(size_bytes),0) used from files where business_id=${businessId}::uuid and deleted_at is null`);
  const configured=await db.execute(sql`select storage_limit_bytes from business_quotas where business_id=${businessId}::uuid limit 1`);
  const used=Number((rows(quota)[0] as any)?.used??0),limit=Number((rows(configured)[0] as any)?.storage_limit_bytes??100*1024*1024);
  if(used+file.size>limit)return error(c,409,'STORAGE_QUOTA_EXCEEDED','Limite de armazenamento atingido',{usedBytes:used,limitBytes:limit});
  const fileId=uuidv7(),linkId=uuidv7(),ext=(file.name.split('.').pop()??'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||'bin';
  const key=`businesses/${businessId}/product/${productId.data}/${fileId}.${ext}`;
  const buffer=await file.arrayBuffer();const hash=await crypto.subtle.digest('SHA-256',buffer);const checksum=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
  await c.env.R2_BUCKET.put(key,buffer,{httpMetadata:{contentType:file.type},customMetadata:{businessId,fileId,entityType:'product',entityId:productId.data}});
  try{
    await db.execute(sql`insert into files(id,business_id,bucket,object_key,original_name,mime_type,size_bytes,checksum_sha256,visibility,uploaded_by,purpose) values(${fileId},${businessId}::uuid,'r2',${key},${file.name.slice(0,255)},${file.type},${file.size},${checksum},'public',${c.get('auth').userId}::uuid,'menu-primary')`);
    await db.execute(sql`insert into entity_files(id,business_id,file_id,entity_type,entity_id,purpose,created_by) values(${linkId},${businessId}::uuid,${fileId}::uuid,'product',${productId.data}::uuid,'menu-primary',${c.get('auth').userId}::uuid)`);
    await db.execute(sql`update products set primary_image_file_id=${fileId}::uuid,updated_at=now() where id=${productId.data}::uuid and business_id=${businessId}::uuid`);
  }catch(e){await c.env.R2_BUCKET.delete(key);throw e;}
  if(product.primary_image_file_id){const old:any=rows(await db.execute(sql`select object_key from files where id=${product.primary_image_file_id}::uuid and business_id=${businessId}::uuid limit 1`))[0];if(old?.object_key){await c.env.R2_BUCKET.delete(old.object_key);await db.execute(sql`update files set deleted_at=now() where id=${product.primary_image_file_id}::uuid and business_id=${businessId}::uuid`);}}
  const origin=new URL(c.req.url).origin;
  return c.json({data:{id:fileId,imageUrl:`${origin}/api/public/media/${fileId}`}},201);
});
