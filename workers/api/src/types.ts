import type { Database } from '@nexoio/db';
import type { Permission } from '@nexoio/permissions';

export interface Bindings {
  DATABASE_URL: string;
  AUTH_SECRET: string;
  AUTH_URL: string;
  APP_URL: string;
  ALLOWED_ORIGINS: string;
  TURNSTILE_SECRET?: string;
  BREVO_API_KEY?: string;
  EMAIL_FROM?: string;
  NOTIFICATION_WEBHOOK_URL?: string;
  NOTIFICATION_WEBHOOK_SECRET?: string;
  R2_BUCKET: R2Bucket;
  API_RATE_LIMITER: RateLimit;
  SENSITIVE_RATE_LIMITER: RateLimit;
  AI?: Ai;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ZONE_ID?: string;
  SAAS_CNAME_TARGET?: string;
  BILLING_PROVIDER?: string;
  BILLING_API_URL?: string;
  BILLING_API_KEY?: string;
  BILLING_WEBHOOK_SECRET?: string;
}
export interface AuthContext {
  userId: string;
  businessId: string;
  roleId: string;
  membershipId: string;
  permissions: Set<Permission>;
  policyLimits: Map<string, number | string | boolean>;
  mfaEnabled: boolean;
  platformAdmin: boolean;
}
export interface Variables { requestId: string; db: Database; auth: AuthContext; sessionUser: { id: string; email: string; name: string; emailVerified: boolean; twoFactorEnabled?: boolean }; }
export type ApiEnv = { Bindings: Bindings; Variables: Variables };
