import { and, asc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { businessMemberships, memberInvitations, rolePermissions, roles, users } from '@nexoio/db';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const teamRoutes = new Hono<ApiEnv>();

teamRoutes.get('/', requirePermission('team.read'), async (c) => {
  const businessId = c.get('auth').businessId;
  const db = c.get('db');
  const memberships = await db.select({
    id: businessMemberships.id,
    userId: businessMemberships.userId,
    status: businessMemberships.status,
    invitedAt: businessMemberships.invitedAt,
    acceptedAt: businessMemberships.acceptedAt,
    name: users.name,
    email: users.email,
    roleId: roles.id,
    roleCode: roles.code,
    roleName: roles.name,
  }).from(businessMemberships)
    .innerJoin(users, eq(users.id, businessMemberships.userId))
    .innerJoin(roles, eq(roles.id, businessMemberships.roleId))
    .where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.status, 'active')))
    .orderBy(asc(users.name));

  const roleIds = [...new Set(memberships.map((row) => row.roleId))];
  const grants = roleIds.length ? await db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, roleIds)) : [];
  const byRole = new Map<string, string[]>();
  for (const grant of grants) {
    const current = byRole.get(grant.roleId) ?? [];
    current.push(grant.permissionCode);
    byRole.set(grant.roleId, current);
  }

  const invitations = await db.select({
    id: memberInvitations.id,
    email: memberInvitations.email,
    roleId: memberInvitations.roleId,
    status: memberInvitations.status,
    createdAt: memberInvitations.createdAt,
    expiresAt: memberInvitations.expiresAt,
    roleName: roles.name,
    roleCode: roles.code,
  }).from(memberInvitations)
    .innerJoin(roles, eq(roles.id, memberInvitations.roleId))
    .where(and(eq(memberInvitations.businessId, businessId), eq(memberInvitations.status, 'pending')))
    .orderBy(asc(memberInvitations.createdAt));

  return c.json({
    data: {
      members: memberships.map((row) => ({ ...row, permissions: byRole.get(row.roleId) ?? [], isCurrentUser: row.userId === c.get('auth').userId })),
      invitations,
    },
  });
});

teamRoutes.get('/roles', requirePermission('team.read'), async (c) => {
  const businessId = c.get('auth').businessId;
  const db = c.get('db');
  const rows = await db.select().from(roles).where(eq(roles.businessId, businessId)).orderBy(asc(roles.name));
  const ids = rows.map((row) => row.id);
  const grants = ids.length ? await db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, ids)) : [];
  return c.json({ data: rows.map((role) => ({ ...role, permissions: grants.filter((g) => g.roleId === role.id).map((g) => g.permissionCode) })) });
});

teamRoutes.patch('/members/:id/role', requirePermission('team.update'), async (c) => {
  const parsed = z.object({ roleId: z.uuid() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, 422, 'VALIDATION_ERROR', 'Função inválida');
  const businessId = c.get('auth').businessId;
  const id = c.req.param('id');
  const db = c.get('db');
  const role = (await db.select().from(roles).where(and(eq(roles.id, parsed.data.roleId), eq(roles.businessId, businessId))).limit(1))[0];
  if (!role) return error(c, 404, 'ROLE_NOT_FOUND', 'Função não encontrada');
  const member = (await db.select().from(businessMemberships).where(and(eq(businessMemberships.id, id), eq(businessMemberships.businessId, businessId), eq(businessMemberships.status, 'active'))).limit(1))[0];
  if (!member) return error(c, 404, 'MEMBER_NOT_FOUND', 'Pessoa não encontrada');
  if (member.userId === c.get('auth').userId && role.code !== 'owner') return error(c, 409, 'OWNER_SELF_CHANGE_BLOCKED', 'O proprietário não pode reduzir o próprio acesso');
  await db.update(businessMemberships).set({ roleId: role.id, updatedAt: new Date() }).where(and(eq(businessMemberships.id, id), eq(businessMemberships.businessId, businessId)));
  return c.json({ data: { ok: true } });
});

teamRoutes.delete('/members/:id', requirePermission('team.remove'), async (c) => {
  const businessId = c.get('auth').businessId;
  const id = c.req.param('id');
  const db = c.get('db');
  const member = (await db.select().from(businessMemberships).where(and(eq(businessMemberships.id, id), eq(businessMemberships.businessId, businessId), eq(businessMemberships.status, 'active'))).limit(1))[0];
  if (!member) return error(c, 404, 'MEMBER_NOT_FOUND', 'Pessoa não encontrada');
  if (member.userId === c.get('auth').userId) return error(c, 409, 'SELF_REMOVE_BLOCKED', 'Você não pode remover seu próprio acesso');
  await db.update(businessMemberships).set({ status: 'removed', updatedAt: new Date() }).where(and(eq(businessMemberships.id, id), eq(businessMemberships.businessId, businessId)));
  return c.json({ data: { ok: true } });
});

teamRoutes.delete('/invitations/:id', requirePermission('team.invite'), async (c) => {
  const businessId = c.get('auth').businessId;
  const id = c.req.param('id');
  const db = c.get('db');
  const row = (await db.select().from(memberInvitations).where(and(eq(memberInvitations.id, id), eq(memberInvitations.businessId, businessId), eq(memberInvitations.status, 'pending'))).limit(1))[0];
  if (!row) return error(c, 404, 'INVITATION_NOT_FOUND', 'Convite não encontrado');
  await db.update(memberInvitations).set({ status: 'cancelled' }).where(and(eq(memberInvitations.id, id), eq(memberInvitations.businessId, businessId)));
  return c.json({ data: { ok: true } });
});
