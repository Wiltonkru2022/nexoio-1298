import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { products, services } from '@nexoio/db';
import { uuidv7 } from '@nexoio/core';
import { createProductSchema, createServiceSchema } from '@nexoio/validation';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const catalogRoutes = new Hono<ApiEnv>();
catalogRoutes.get('/products', requirePermission('products.read'), async (c) => c.json({ data: await c.get('db').select().from(products).where(eq(products.businessId, c.get('auth').businessId)).orderBy(desc(products.createdAt)).limit(100) }));
catalogRoutes.post('/products', requirePermission('products.write'), async (c) => {
  const parsed = createProductSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success) return error(c, 422, 'VALIDATION_ERROR', 'Dados inválidos', parsed.error.flatten());
  const [row] = await c.get('db').insert(products).values({ id: uuidv7(), businessId: c.get('auth').businessId, ...parsed.data, salePrice: String(parsed.data.salePrice), costPrice: parsed.data.costPrice === undefined ? undefined : String(parsed.data.costPrice), minimumStock: parsed.data.minimumStock === undefined ? undefined : String(parsed.data.minimumStock) }).returning(); return c.json({ data: row }, 201);
});
catalogRoutes.patch('/products/:id', requirePermission('products.write'), async (c) => {
  const b=c.get('auth').businessId,id=c.req.param('id'),body=await c.req.json().catch(()=>({}));
  const current=await c.get('db').select().from(products).where(and(eq(products.businessId,b),eq(products.id,id))).limit(1); if(!current[0])return error(c,404,'NOT_FOUND','Produto não encontrado');
  const values:any={updatedAt:new Date()};
  if(body.name!==undefined)values.name=String(body.name).trim();
  if(body.description!==undefined)values.description=String(body.description||'').trim()||null;
  if(body.sku!==undefined)values.sku=String(body.sku||'').trim()||null;
  if(body.barcode!==undefined)values.barcode=String(body.barcode||'').trim()||null;
  if(body.salePrice!==undefined)values.salePrice=Number(body.salePrice).toFixed(2);
  if(body.costPrice!==undefined)values.costPrice=body.costPrice===null?null:Number(body.costPrice).toFixed(2);
  if(body.minimumStock!==undefined)values.minimumStock=body.minimumStock===null?null:Number(body.minimumStock).toFixed(3);
  if(body.stockControlEnabled!==undefined)values.stockControlEnabled=Boolean(body.stockControlEnabled);
  if(body.active!==undefined)values.active=Boolean(body.active);
  const [row]=await c.get('db').update(products).set(values).where(and(eq(products.businessId,b),eq(products.id,id))).returning(); return c.json({data:row});
});
catalogRoutes.delete('/products/:id', requirePermission('products.write'), async (c) => {
  const b=c.get('auth').businessId,id=c.req.param('id');
  const current=await c.get('db').select().from(products).where(and(eq(products.businessId,b),eq(products.id,id))).limit(1); if(!current[0])return error(c,404,'NOT_FOUND','Produto não encontrado');
  await c.get('db').update(products).set({active:false,updatedAt:new Date()}).where(and(eq(products.businessId,b),eq(products.id,id))); return c.json({data:{ok:true}});
});
catalogRoutes.get('/services', requirePermission('services.read'), async (c) => c.json({ data: await c.get('db').select().from(services).where(eq(services.businessId, c.get('auth').businessId)).orderBy(desc(services.createdAt)).limit(100) }));
catalogRoutes.post('/services', requirePermission('services.write'), async (c) => {
  const parsed = createServiceSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success) return error(c, 422, 'VALIDATION_ERROR', 'Dados inválidos', parsed.error.flatten());
  const [row] = await c.get('db').insert(services).values({ id: uuidv7(), businessId: c.get('auth').businessId, ...parsed.data, price: String(parsed.data.price) }).returning(); return c.json({ data: row }, 201);
});
