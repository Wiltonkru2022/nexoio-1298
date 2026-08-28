import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { customers } from '@nexoio/db';
import { uuidv7 } from '@nexoio/core';
import { createCustomerSchema, updateCustomerSchema } from '@nexoio/validation';
import { requirePermission, error } from '../middleware';
import type { ApiEnv } from '../types';

export const customerRoutes = new Hono<ApiEnv>();
customerRoutes.get('/', requirePermission('customers.read'), async (c) => {
  const { businessId } = c.get('auth'); const q = c.req.query('q')?.slice(0, 100); const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
  const filter = q ? and(eq(customers.businessId, businessId), or(ilike(customers.name, `%${q}%`), ilike(customers.phone, `%${q}%`), ilike(customers.email, `%${q}%`))) : eq(customers.businessId, businessId);
  return c.json({ data: await c.get('db').select().from(customers).where(filter).orderBy(desc(customers.createdAt)).limit(limit) });
});
customerRoutes.get('/:id', requirePermission('customers.read'), async (c) => {
  const rows = await c.get('db').select().from(customers).where(and(eq(customers.id, c.req.param('id')), eq(customers.businessId, c.get('auth').businessId))).limit(1);
  return rows[0] ? c.json({ data: rows[0] }) : error(c, 404, 'CUSTOMER_NOT_FOUND', 'Cliente não encontrado');
});
customerRoutes.post('/', requirePermission('customers.create'), async (c) => {
  const parsed = createCustomerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, 422, 'VALIDATION_ERROR', 'Dados inválidos', parsed.error.flatten());
  const [created] = await c.get('db').insert(customers).values({ id: uuidv7(), businessId: c.get('auth').businessId, ...parsed.data }).returning();
  return c.json({ data: created }, 201);
});
customerRoutes.patch('/:id', requirePermission('customers.update'), async (c) => {
  const parsed = updateCustomerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, 422, 'VALIDATION_ERROR', 'Dados inválidos', parsed.error.flatten());
  const [updated] = await c.get('db').update(customers).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(customers.id, c.req.param('id')), eq(customers.businessId, c.get('auth').businessId))).returning();
  return updated ? c.json({ data: updated }) : error(c, 404, 'CUSTOMER_NOT_FOUND', 'Cliente não encontrado');
});
