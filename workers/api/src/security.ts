import { createMiddleware } from 'hono/factory';
import { auditLogs } from '@nexoio/db';
import { uuidv7 } from '@nexoio/core';
import { error } from './middleware';
import type { ApiEnv } from './types';

const CRITICAL_MUTATION_PREFIXES=[
  '/api/v1/billing','/api/v1/finance','/api/v1/cash','/api/v1/sales','/api/v1/patients','/api/v1/medical-records','/api/v1/domains','/api/v1/platform/business/public-site','/api/v1/service-orders'
] as const;
const isMutation=(method:string)=>['POST','PUT','PATCH','DELETE'].includes(method.toUpperCase());
export const isCriticalMutation=(method:string,path:string)=>isMutation(method)&&CRITICAL_MUTATION_PREFIXES.some(prefix=>path===prefix||path.startsWith(`${prefix}/`));

export const cloudflareRateLimit=createMiddleware<ApiEnv>(async(c,next)=>{
  const auth=c.get('auth');const key=`${auth.businessId}:${auth.userId}`;
  const general=await c.env.API_RATE_LIMITER.limit({key});
  if(!general.success)return error(c,429,'RATE_LIMITED','Muitas requisições. Aguarde um instante e tente novamente.');
  if(isCriticalMutation(c.req.method,c.req.path)){
    const sensitive=await c.env.SENSITIVE_RATE_LIMITER.limit({key:`${key}:${c.req.path.split('/').slice(0,4).join('/')}`});
    if(!sensitive.success)return error(c,429,'SENSITIVE_RATE_LIMITED','Limite temporário de ações sensíveis atingido.');
  }
  await next();
});

// MFA é opt-in. Mantemos o middleware para compatibilidade, mas ele não bloqueia
// clientes que escolheram operar somente com senha/sessão. Quem ativar 2FA continua
// protegido pelo fluxo do Better Auth durante o login.
export const requireCriticalMfa=createMiddleware<ApiEnv>(async(_c,next)=>{await next();});

export const auditSensitiveMutation=createMiddleware<ApiEnv>(async(c,next)=>{
  const sensitive=isCriticalMutation(c.req.method,c.req.path);await next();if(!sensitive)return;
  const auth=c.get('auth');
  c.executionCtx.waitUntil(c.get('db').insert(auditLogs).values({
    id:uuidv7(),businessId:auth.businessId,actorUserId:auth.userId,action:'security.sensitive_mutation',entityType:'http_route',entityId:null,requestId:c.get('requestId'),
    afterJson:{method:c.req.method,path:c.req.path,status:c.res.status,mfaEnabled:Boolean(c.get('sessionUser').twoFactorEnabled)},userAgent:c.req.header('user-agent')?.slice(0,500)
  }).then(()=>undefined));
});
