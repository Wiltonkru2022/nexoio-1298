import type { Database } from '@nexoio/db';
import type { Permission } from '@nexoio/permissions';

export interface Bindings {
  DATABASE_URL: string; AUTH_SECRET: string; AUTH_URL: string; APP_URL: string; ALLOWED_ORIGINS: string; TURNSTILE_SECRET?: string; BREVO_API_KEY?: string; EMAIL_FROM?: string; R2_BUCKET: R2Bucket; AI?: Ai;
}
export interface AuthContext { userId: string; businessId: string; roleId: string; permissions: Set<Permission>; mfaEnabled: boolean; platformAdmin: boolean; }
export interface Variables { requestId: string; db: Database; auth: AuthContext; sessionUser: { id: string; email: string; name: string; emailVerified: boolean; twoFactorEnabled?: boolean }; }
export type ApiEnv = { Bindings: Bindings; Variables: Variables };
