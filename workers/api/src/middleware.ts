import { and, eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { createDb, businessMemberships, rolePermissions, users } from '@nexoio/db';
import type { Permission } from '@nexoio/permissions';
import { createAuth } from './auth';
import type { ApiEnv } from './types';

export const requestContext = createMiddleware<ApiEnv>(async (c, next) => {
  const requestId = c.req.header('cf-ray') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.set('db', createDb(c.env.DATABASE_URL));
  c.header('x-request-id', requestId);
  const started = Date.now();
  await next();
  console.log(JSON.stringify({ request_id: requestId, route: c.req.path, status: c.res.status, duration_ms: Date.now() - started }));
});

export const requireAuth = createMiddleware<ApiEnv>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return error(c, 401, 'UNAUTHORIZED', 'Autenticação necessária');
  c.set('sessionUser', session.user);
  const businessId = getCookie(c, 'nexoio_business');
  if (!businessId) return error(c, 404, 'BUSINESS_NOT_FOUND', 'Selecione uma empresa');
  const db = c.get('db');
  const membership = await db.select({ roleId: businessMemberships.roleId, userId: users.id, mfaEnabled: users.mfaEnabled, platformAdmin: users.platformAdmin })
    .from(businessMemberships).innerJoin(users, eq(users.id, businessMemberships.userId))
    .where(and(eq(businessMemberships.businessId, businessId), eq(users.authUserId, session.user.id), eq(businessMemberships.status, 'active'))).limit(1);
  if (!membership[0]) return error(c, 404, 'BUSINESS_NOT_FOUND', 'Empresa não encontrada');
  const grants = await db.select({ code: rolePermissions.permissionCode }).from(rolePermissions).where(eq(rolePermissions.roleId, membership[0].roleId));
  c.set('auth', { userId: membership[0].userId, businessId, roleId: membership[0].roleId, permissions: new Set(grants.map((g) => g.code as Permission)), mfaEnabled: membership[0].mfaEnabled, platformAdmin: membership[0].platformAdmin });
  await next();
});

export const requireSession = createMiddleware<ApiEnv>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return error(c, 401, 'SESSION_EXPIRED', 'Sua sessão expirou');
  c.set('sessionUser', session.user); await next();
});

export function requirePermission(permission: Permission) {
  return createMiddleware<ApiEnv>(async (c, next) => c.get('auth').permissions.has(permission) ? next() : error(c, 403, 'FORBIDDEN', 'Permissão insuficiente'));
}
export function requireModule(moduleCode: string) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const { businessModules } = await import('@nexoio/db'); const { and, eq } = await import('drizzle-orm');
    const active = await c.get('db').select({ id: businessModules.id }).from(businessModules).where(and(eq(businessModules.businessId, c.get('auth').businessId), eq(businessModules.moduleCode, moduleCode), eq(businessModules.enabled, true))).limit(1);
    return active[0] ? next() : error(c, 403, 'MODULE_DISABLED', 'Este módulo não está habilitado para a empresa');
  });
}
export function error(c: any, status: number, code: string, message: string, details?: unknown) {
  return c.json({ error: { code, message, requestId: c.get('requestId'), ...(details ? { details } : {}) } }, status);
}
