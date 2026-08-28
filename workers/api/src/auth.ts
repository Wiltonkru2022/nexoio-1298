import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createDb, authAccounts, authSessions, authUsers, authVerifications } from '@nexoio/db';
import type { Bindings } from './types';

type AuthRuntime = {
  handler(request: Request): Promise<Response>;
  api: { getSession(input: { headers: Headers }): Promise<{ user: { id: string }; session: unknown } | null> };
};

export function createAuth(env: Bindings): AuthRuntime {
  const db = createDb(env.DATABASE_URL);
  return betterAuth({
    baseURL: env.AUTH_URL,
    secret: env.AUTH_SECRET,
    trustedOrigins: env.ALLOWED_ORIGINS.split(',').map((v) => v.trim()),
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: authUsers, session: authSessions, account: authAccounts, verification: authVerifications }
    }),
    user: { modelName: 'auth_users' },
    session: { modelName: 'auth_sessions', cookieCache: { enabled: true, maxAge: 300 } },
    account: { modelName: 'auth_accounts' },
    verification: { modelName: 'auth_verifications' },
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
    advanced: {
      cookiePrefix: 'nexoio',
      defaultCookieAttributes: { httpOnly: true, secure: env.AUTH_URL.startsWith('https://'), sameSite: 'lax', path: '/' },
      useSecureCookies: env.AUTH_URL.startsWith('https://')
    }
  }) as AuthRuntime;
}
