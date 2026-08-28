import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { businessModules, moduleRecords } from '@nexoio/db';
import { MODULES, uuidv7 } from '@nexoio/core';
import { error } from '../middleware';
import type { ApiEnv } from '../types';

const moduleKeySchema = z.enum(MODULES);
const SPECIALIZED_MODULES = new Set([
  'customers','products','services','schedule','sales','cash','finance','inventory','orders','tables','commands','kitchen','delivery',
  'service_orders','equipment','parts','warranties','patients','medical_records','procedures','plans','memberships','classes','checkin',
  'professionals','commissions','suppliers'
]);
const createSchema = z.object({
  name: z.string().trim().min(1).max(180),
  details: z.string().trim().max(2000).optional().default(''),
  status: z.string().trim().min(1).max(80).default('Ativo'),
  data: z.record(z.string(), z.unknown()).optional().default({}),
}).strict();

export const moduleRecordRoutes = new Hono<ApiEnv>();

function rejectSpecialized(c: any, moduleCode: string) {
  return SPECIALIZED_MODULES.has(moduleCode)
    ? error(c, 410, 'SPECIALIZED_MODULE_REQUIRED', 'Este módulo possui domínio próprio e não aceita mais registros genéricos')
    : null;
}

async function ensureEnabled(c: any, moduleCode: string) {
  const row = await c.get('db').select({ id: businessModules.id }).from(businessModules)
    .where(and(
      eq(businessModules.businessId, c.get('auth').businessId),
      eq(businessModules.moduleCode, moduleCode),
      eq(businessModules.enabled, true),
    )).limit(1);
  return Boolean(row[0]);
}

moduleRecordRoutes.get('/:moduleKey', async (c) => {
  const parsed = moduleKeySchema.safeParse(c.req.param('moduleKey'));
  if (!parsed.success) return error(c, 404, 'MODULE_NOT_FOUND', 'Módulo inválido');
  const specialized = rejectSpecialized(c, parsed.data); if (specialized) return specialized;
  if (!await ensureEnabled(c, parsed.data)) return error(c, 403, 'MODULE_DISABLED', 'Este módulo não está habilitado para a empresa');
  const rows = await c.get('db').select().from(moduleRecords)
    .where(and(eq(moduleRecords.businessId, c.get('auth').businessId), eq(moduleRecords.moduleCode, parsed.data)))
    .orderBy(desc(moduleRecords.createdAt));
  return c.json({ data: rows });
});

moduleRecordRoutes.post('/:moduleKey', async (c) => {
  const moduleKey = moduleKeySchema.safeParse(c.req.param('moduleKey'));
  if (!moduleKey.success) return error(c, 404, 'MODULE_NOT_FOUND', 'Módulo inválido');
  const specialized = rejectSpecialized(c, moduleKey.data); if (specialized) return specialized;
  if (!await ensureEnabled(c, moduleKey.data)) return error(c, 403, 'MODULE_DISABLED', 'Este módulo não está habilitado para a empresa');
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, 422, 'VALIDATION_ERROR', 'Dados inválidos', parsed.error.flatten());
  const record = {
    id: uuidv7(),
    businessId: c.get('auth').businessId,
    moduleCode: moduleKey.data,
    name: parsed.data.name,
    details: parsed.data.details,
    status: parsed.data.status,
    dataJson: parsed.data.data,
    createdBy: c.get('auth').userId,
  };
  await c.get('db').insert(moduleRecords).values(record);
  return c.json({ data: record }, 201);
});

moduleRecordRoutes.delete('/:moduleKey/:id', async (c) => {
  const moduleKey = moduleKeySchema.safeParse(c.req.param('moduleKey'));
  const id = z.uuid().safeParse(c.req.param('id'));
  if (!moduleKey.success || !id.success) return error(c, 422, 'VALIDATION_ERROR', 'Registro inválido');
  const specialized = rejectSpecialized(c, moduleKey.data); if (specialized) return specialized;
  if (!await ensureEnabled(c, moduleKey.data)) return error(c, 403, 'MODULE_DISABLED', 'Este módulo não está habilitado para a empresa');
  const removed = await c.get('db').delete(moduleRecords)
    .where(and(
      eq(moduleRecords.id, id.data),
      eq(moduleRecords.businessId, c.get('auth').businessId),
      eq(moduleRecords.moduleCode, moduleKey.data),
    )).returning({ id: moduleRecords.id });
  if (!removed[0]) return error(c, 404, 'NOT_FOUND', 'Registro não encontrado');
  return c.json({ data: { id: removed[0].id, deleted: true } });
});
