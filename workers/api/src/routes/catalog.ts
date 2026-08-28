import { desc, eq } from 'drizzle-orm';
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
catalogRoutes.get('/services', requirePermission('services.read'), async (c) => c.json({ data: await c.get('db').select().from(services).where(eq(services.businessId, c.get('auth').businessId)).orderBy(desc(services.createdAt)).limit(100) }));
catalogRoutes.post('/services', requirePermission('services.write'), async (c) => {
  const parsed = createServiceSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success) return error(c, 422, 'VALIDATION_ERROR', 'Dados inválidos', parsed.error.flatten());
  const [row] = await c.get('db').insert(services).values({ id: uuidv7(), businessId: c.get('auth').businessId, ...parsed.data, price: String(parsed.data.price) }).returning(); return c.json({ data: row }, 201);
});
