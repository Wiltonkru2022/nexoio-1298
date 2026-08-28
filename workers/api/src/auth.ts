import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createDb, authSessions, authTwoFactors, authUsers, authVerifications, users } from '@nexoio/db';
import { uuidv7 } from '@nexoio/core';
import type { Bindings } from './types';

type AuthSession = { user: { id: string; email: string; name: string; emailVerified: boolean; twoFactorEnabled?: boolean }; session: { id: string; expiresAt: Date } };
export type AuthRuntime = { handler(request: Request): Promise<Response>; api: { getSession(input: { headers: Headers }): Promise<AuthSession | null> } };

// Better Auth 1.7+ requires `issuer` on the account model. Keep the adapter
// schema aligned with the physical auth_accounts table migrated by 0002.
const authAccountsV17 = pgTable('auth_accounts', {
  id: text().primaryKey(),
  issuer: text().notNull(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text(),
  password: text(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

function parseSender(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (match) return { name: match[1] || 'Nexoio', email: match[2].trim() };
  return { name: 'Nexoio', email: value.trim() };
}

async function deliverEmail(env: Bindings, to: string, subject: string, html: string) {
  if (!env.BREVO_API_KEY || !env.EMAIL_FROM) {
    console.log(JSON.stringify({ event: 'email.skipped', to, subject }));
    return;
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: parseSender(env.EMAIL_FROM),
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(JSON.stringify({ event: 'email.failed', provider: 'brevo', status: response.status, detail: detail.slice(0, 500) }));
    throw new Error(`Email provider returned ${response.status}`);
  }
}

export function createAuth(env: Bindings, executionCtx?: { waitUntil(promise: Promise<unknown>): void }): AuthRuntime {
  const db = createDb(env.DATABASE_URL);
  const background = (promise: Promise<unknown>) => executionCtx ? executionCtx.waitUntil(promise) : void promise;
  const sendLink = async (to: string, subject: string, url: string) => {
    background(deliverEmail(env, to, subject, `<p>${subject}</p><p><a href="${url}">Continuar com segurança</a></p><p>Se você não solicitou esta ação, ignore esta mensagem.</p>`));
  };
  return betterAuth({
    appName: 'Nexoio', baseURL: env.AUTH_URL, secret: env.AUTH_SECRET,
    trustedOrigins: env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()),
    database: drizzleAdapter(db, { provider: 'pg', schema: { user: authUsers, session: authSessions, account: authAccountsV17, verification: authVerifications, twoFactor: authTwoFactors } }),
    emailVerification: { sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: true, expiresIn: 3600, sendVerificationEmail: ({ user, url }) => sendLink(user.email, 'Verifique seu e-mail Nexoio', url) },
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, requireEmailVerification: true, revokeSessionsOnPasswordReset: true, resetPasswordTokenExpiresIn: 3600, sendResetPassword: ({ user, url }) => sendLink(user.email, 'Redefina sua senha Nexoio', url) },
    rateLimit: { enabled: true, window: 60, max: 20 },
    databaseHooks: { user: { create: { after: async (authUser) => { await db.insert(users).values({ id: uuidv7(), authUserId: authUser.id, name: authUser.name, email: authUser.email }).onConflictDoNothing(); } } } },
    plugins: [twoFactor({ issuer: 'Nexoio', backupCodeLength: 12, backupCodeCount: 10 })],
    advanced: { cookiePrefix: 'nexoio', defaultCookieAttributes: { httpOnly: true, secure: env.AUTH_URL.startsWith('https://'), sameSite: 'lax', path: '/' }, useSecureCookies: env.AUTH_URL.startsWith('https://') }
  }) as AuthRuntime;
}
