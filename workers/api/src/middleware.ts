import { and, eq, sql } from 'drizzle-orm';
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
  const membership = await db.select({ membershipId: businessMemberships.id, roleId: businessMemberships.roleId, userId: users.id, mfaEnabled: users.mfaEnabled, platformAdmin: users.platformAdmin })
    .from(businessMemberships).innerJoin(users, eq(users.id, businessMemberships.userId))
    .where(and(eq(businessMemberships.businessId, businessId), eq(users.authUserId, session.user.id), eq(users.status,'active'), eq(businessMemberships.status, 'active'))).limit(1);
  if (!membership[0]) {
    const profile=await db.select({status:users.status}).from(users).where(eq(users.authUserId,session.user.id)).limit(1);
    if(profile[0]&&profile[0].status!=='active')return error(c,403,'USER_SUSPENDED','Usuário suspenso pela administração da plataforma');
    return error(c, 404, 'BUSINESS_NOT_FOUND', 'Empresa não encontrada');
  }
  const [grants, overrideResult, limitResult] = await Promise.all([
    db.select({ code: rolePermissions.permissionCode }).from(rolePermissions).where(eq(rolePermissions.roleId, membership[0].roleId)),
    db.execute(sql`select permission_code,allowed from membership_permission_overrides where membership_id=${membership[0].membershipId}::uuid`),
    db.execute(sql`select policy_key,numeric_value,text_value,boolean_value from role_policy_limits where role_id=${membership[0].roleId}::uuid`),
  ]);
  const permissions = new Set(grants.map((g) => g.code as Permission));
  const overrideRows:any[]=(overrideResult as any)?.rows??overrideResult??[];
  for(const row of overrideRows){if(row.allowed)permissions.add(row.permission_code as Permission);else permissions.delete(row.permission_code as Permission);}
  const policyLimits=new Map<string,number|string|boolean>();
  const limitRows:any[]=(limitResult as any)?.rows??limitResult??[];
  for(const row of limitRows){if(row.numeric_value!==null&&row.numeric_value!==undefined)policyLimits.set(row.policy_key,Number(row.numeric_value));else if(row.boolean_value!==null&&row.boolean_value!==undefined)policyLimits.set(row.policy_key,Boolean(row.boolean_value));else if(row.text_value!==null&&row.text_value!==undefined)policyLimits.set(row.policy_key,String(row.text_value));}
  c.set('auth', { userId: membership[0].userId, businessId, roleId: membership[0].roleId, membershipId: membership[0].membershipId, permissions, policyLimits, mfaEnabled: membership[0].mfaEnabled, platformAdmin: membership[0].platformAdmin });
  await next();
});

export const requireSession = createMiddleware<ApiEnv>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return error(c, 401, 'SESSION_EXPIRED', 'Sua sessão expirou');
  const profile=(await c.get('db').select({status:users.status}).from(users).where(eq(users.authUserId,session.user.id)).limit(1))[0];
  if(profile&&profile.status!=='active')return error(c,403,'USER_SUSPENDED','Usuário suspenso pela administração da plataforma');
  c.set('sessionUser', session.user); await next();
});

export function requirePermission(permission: Permission) {
  return createMiddleware<ApiEnv>(async (c, next) => c.get('auth').permissions.has(permission) ? next() : error(c, 403, 'FORBIDDEN', 'Permissão insuficiente'));
}
export function requirePolicyLimit(key:string,value:number){
  return createMiddleware<ApiEnv>(async(c,next)=>{const limit=c.get('auth').policyLimits.get(key);return typeof limit==='number'&&value>limit?error(c,403,'POLICY_LIMIT_EXCEEDED',`A operação excede o limite permitido (${key})`,{limit,value}):next();});
}
export function requireModule(moduleCode: string) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const db=c.get('db');
    const businessId=c.get('auth').businessId;
    const moduleResult:any=await db.execute(sql`select id from business_modules where business_id=${businessId}::uuid and module_code=${moduleCode} and enabled=true limit 1`);
    const moduleRows:any[]=moduleResult?.rows??moduleResult??[];
    if(!moduleRows.length)return error(c,403,'MODULE_DISABLED','Este módulo não está habilitado para a empresa');

    const subscriptionResult:any=await db.execute(sql`
      select s.id,s.status,s.trial_ends_at,s.current_period_end,s.past_due_since,s.cancel_at_period_end,p.id plan_id,
        (select jsonb_build_object('enabled',pf.enabled,'limit',pf.limit_value,'feature',pf.feature_code)
           from plan_features pf
          where pf.plan_id=p.id and pf.feature_code in (${`module:${moduleCode}`},${moduleCode})
          order by case when pf.feature_code=${`module:${moduleCode}`} then 0 else 1 end
          limit 1) entitlement
      from subscriptions s join plans p on p.id=s.plan_id
      where s.business_id=${businessId}::uuid limit 1
    `);
    const subscription:any=(subscriptionResult?.rows??subscriptionResult??[])[0];
    // Legacy businesses created before billing rollout remain compatible until a subscription row exists.
    if(!subscription)return next();

    const status=String(subscription.status??'').toLowerCase();
    const now=Date.now();
    const graceMs=3*24*60*60*1000;
    const pastDueSince=subscription.past_due_since?new Date(subscription.past_due_since).getTime():null;
    const hardBlocked=['cancelled','canceled','expired','suspended','inactive'].includes(status);
    const graceExpired=status==='past_due'&&pastDueSince!==null&&now-pastDueSince>graceMs;
    const trialExpired=status==='trialing'&&subscription.trial_ends_at&&new Date(subscription.trial_ends_at).getTime()<now;
    if(hardBlocked||graceExpired||trialExpired)return error(c,402,'SUBSCRIPTION_REQUIRED','A assinatura da empresa não permite usar este módulo',{status,graceDays:status==='past_due'?3:undefined});

    const entitlement=subscription.entitlement as {enabled?:boolean;limit?:number|string|null;feature?:string}|null;
    if(entitlement&&entitlement.enabled===false)return error(c,403,'PLAN_FEATURE_DISABLED','Este módulo não faz parte do plano contratado',{moduleCode,feature:entitlement.feature});
    return next();
  });
}
export function error(c: any, status: number, code: string, message: string, details?: unknown) {
  return c.json({ error: { code, message, requestId: c.get('requestId'), ...(details ? { details } : {}) } }, status);
}
