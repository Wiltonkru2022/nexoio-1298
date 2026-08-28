import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { sql } from 'drizzle-orm';
import { auditLogs } from '@nexoio/db';
import { uuidv7 } from '@nexoio/core';
import { createAuth } from './auth';
import { error, requestContext, requireAuth, requireModule } from './middleware';
import { customerRoutes } from './routes/customers';
import { catalogRoutes } from './routes/catalog';
import { appointmentRoutes } from './routes/appointments';
import { platformRoutes } from './routes/platform';
import { adminRoutes } from './routes/admin';
import { moduleRecordRoutes } from './routes/module-records';
import { operationalRoutes } from './routes/operations';
import { financeCashRoutes } from './routes/finance-cash';
import { productInfrastructureRoutes, publicAssetRoutes } from './routes/product-infrastructure';
import type { ApiEnv } from './types';

const app = new Hono<ApiEnv>();
app.use('*', requestContext);
app.use('*', async (c, next) => cors({
  origin: (origin) => {
    const allowed = new Set(c.env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean));
    return allowed.has(origin) ? origin : '';
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'X-Business-Id', 'Idempotency-Key'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
})(c, next));
app.use('*', secureHeaders({ strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload', referrerPolicy: 'strict-origin-when-cross-origin', permissionsPolicy: { camera: [], microphone: [], geolocation: [] } }));
app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/ready', async (c) => { try { await c.get('db').execute(sql`select 1`); return c.json({ status: 'ready' }); } catch { return error(c, 503, 'NOT_READY', 'Dependência indisponível'); } });
app.route('/api/public/media', publicAssetRoutes);
app.all('/api/auth/*', async (c) => {
  const response=await createAuth(c.env,c.executionCtx).handler(c.req.raw); const route=c.req.path.replace('/api/auth/','');
  const events:Record<string,string>={'sign-in/email':response.ok?'auth.login.success':'auth.login.failed','sign-out':'auth.logout','change-password':'auth.password.changed','reset-password':'auth.password.reset','change-email':'auth.email.changed','revoke-other-sessions':'auth.session.revoked','two-factor/enable':'auth.mfa.enabled','two-factor/disable':'auth.mfa.disabled'};
  const action=events[route]; if(action)c.executionCtx.waitUntil(c.get('db').insert(auditLogs).values({id:uuidv7(),action,requestId:c.get('requestId'),userAgent:c.req.header('user-agent')?.slice(0,500),afterJson:{status:response.status}}).then(()=>undefined)); return response;
});
app.route('/api/v1/platform', platformRoutes);
app.route('/api/v1/admin', adminRoutes);
app.use('/api/v1/*', requireAuth);
app.get('/api/v1/me', (c) => c.json({ data: { userId: c.get('auth').userId, businessId: c.get('auth').businessId, permissions: [...c.get('auth').permissions] } }));
app.use('/api/v1/customers/*', requireModule('customers'));
app.use('/api/v1/products/*', requireModule('products'));
app.use('/api/v1/services/*', requireModule('services'));
app.use('/api/v1/appointments/*', requireModule('schedule'));
app.use('/api/v1/orders/*', requireModule('orders'));
app.use('/api/v1/kitchen/*', requireModule('kitchen'));
app.use('/api/v1/inventory/*', requireModule('inventory'));
app.use('/api/v1/service-orders/*', requireModule('service_orders'));
app.use('/api/v1/patients/*', requireModule('patients'));
app.use('/api/v1/enrollments/*', requireModule('memberships'));
app.use('/api/v1/checkins/*', requireModule('checkin'));
app.route('/api/v1/customers', customerRoutes);
app.route('/api/v1', catalogRoutes);
app.route('/api/v1/appointments', appointmentRoutes);
app.route('/api/v1', operationalRoutes);
app.route('/api/v1', financeCashRoutes);
app.route('/api/v1', productInfrastructureRoutes);
app.route('/api/v1/module-records', moduleRecordRoutes);
app.notFound((c) => error(c, 404, 'NOT_FOUND', 'Rota não encontrada'));
app.onError((err, c) => { console.error(JSON.stringify({ request_id: c.get('requestId'), error: err.message })); return error(c, 500, 'INTERNAL_ERROR', 'Erro interno'); });
export default app;
