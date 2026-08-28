import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import { createDb, authAccounts, authSessions, authTwoFactors, authUsers, authVerifications, users } from '@nexoio/db';
import { uuidv7 } from '@nexoio/core';
import type { Bindings } from './types';

type AuthSession = { user: { id: string; email: string; name: string; emailVerified: boolean; twoFactorEnabled?: boolean }; session: { id: string; expiresAt: Date } };
export type AuthRuntime = { handler(request: Request): Promise<Response>; api: { getSession(input: { headers: Headers }): Promise<AuthSession | null> } };

async function deliverEmail(env: Bindings, to: string, subject: string, html: string) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) { console.log(JSON.stringify({ event: 'email.skipped', to, subject })); return; }
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }) });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

export function createAuth(env: Bindings, executionCtx?: { waitUntil(promise: Promise<unknown>): void }): AuthRuntime {
  const db = createDb(env.DATABASE_URL);
  const background = (promise: Promise<unknown>) => executionCtx ? executionCtx.waitUntil(promise) : void promise;
  const sendLink = async (to: string, subject: string, url: string) => { background(deliverEmail(env, to, subject, `<p>${subject}</p><p><a href="${url}">Continuar com segurança</a></p><p>Se você não solicitou esta ação, ignore esta mensagem.</p>`)); };
  return betterAuth({
    appName: 'Nexoio', baseURL: env.AUTH_URL, secret: env.AUTH_SECRET,
    trustedOrigins: env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()),
    database: drizzleAdapter(db, { provider: 'pg', schema: { user: authUsers, session: authSessions, account: authAccounts, verification: authVerifications, twoFactor: authTwoFactors } }),
    user: { modelName: 'auth_users', changeEmail: { enabled: true } },
    session: { modelName: 'auth_sessions', expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: true, maxAge: 300 } },
    account: { modelName: 'auth_accounts' }, verification: { modelName: 'auth_verifications' },
    emailVerification: { sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: true, expiresIn: 3600, sendVerificationEmail: ({ user, url }) => sendLink(user.email, 'Verifique seu e-mail Nexoio', url) },
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, requireEmailVerification: true, revokeSessionsOnPasswordReset: true, resetPasswordTokenExpiresIn: 3600, sendResetPassword: ({ user, url }) => sendLink(user.email, 'Redefina sua senha Nexoio', url) },
    rateLimit: { enabled: true, window: 60, max: 20 },
    databaseHooks: { user: { create: { after: async (authUser) => { await db.insert(users).values({ id: uuidv7(), authUserId: authUser.id, name: authUser.name, email: authUser.email }).onConflictDoNothing(); } } } },
    plugins: [twoFactor({ issuer: 'Nexoio', backupCodeLength: 12, backupCodeCount: 10 })],
    advanced: { cookiePrefix: 'nexoio', defaultCookieAttributes: { httpOnly: true, secure: env.AUTH_URL.startsWith('https://'), sameSite: 'lax', path: '/' }, useSecureCookies: env.AUTH_URL.startsWith('https://') }
  }) as AuthRuntime;
}
