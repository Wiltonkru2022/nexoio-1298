import { and, eq, gt, lt, notInArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appointments } from '@nexoio/db';
import { uuidv7 } from '@nexoio/core';
import { createAppointmentSchema } from '@nexoio/validation';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const appointmentRoutes = new Hono<ApiEnv>();
appointmentRoutes.get('/', requirePermission('appointments.read'), async (c) => c.json({ data: await c.get('db').select().from(appointments).where(eq(appointments.businessId, c.get('auth').businessId)).limit(200) }));
appointmentRoutes.post('/', requirePermission('appointments.write'), async (c) => {
  const parsed = createAppointmentSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success) return error(c, 422, 'VALIDATION_ERROR', 'Dados inválidos', parsed.error.flatten());
  const start = new Date(parsed.data.startsAt); const end = new Date(parsed.data.endsAt); const businessId = c.get('auth').businessId;
  const conflict = await c.get('db').select({ id: appointments.id }).from(appointments).where(and(eq(appointments.businessId, businessId), eq(appointments.professionalId, parsed.data.professionalId), lt(appointments.startsAt, end), gt(appointments.endsAt, start), notInArray(appointments.status, ['cancelled','no_show']))).limit(1);
  if (conflict[0]) return error(c, 409, 'APPOINTMENT_CONFLICT', 'O profissional já possui compromisso nesse horário');
  const [row] = await c.get('db').insert(appointments).values({ id: uuidv7(), businessId, ...parsed.data, startsAt: start, endsAt: end, status: 'pending', createdBy: c.get('auth').userId }).returning(); return c.json({ data: row }, 201);
});

appointmentRoutes.patch('/:id/status', requirePermission('appointments.write'), async (c) => {
  const appointmentId=z.uuid().safeParse(c.req.param('id'));const body=z.object({status:z.enum(['pending','confirmed','completed','cancelled','no_show'])}).safeParse(await c.req.json().catch(()=>null));
  if(!appointmentId.success||!body.success)return error(c,422,'VALIDATION_ERROR','Atualização de agendamento inválida');
  const [row]=await c.get('db').update(appointments).set({status:body.data.status,updatedAt:new Date()}).where(and(eq(appointments.id,appointmentId.data),eq(appointments.businessId,c.get('auth').businessId))).returning();
  if(!row)return error(c,404,'APPOINTMENT_NOT_FOUND','Agendamento não encontrado');
  return c.json({data:row});
});
