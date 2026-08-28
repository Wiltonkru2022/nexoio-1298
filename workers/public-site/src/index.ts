import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { businessPublicProfiles, businesses, createDb } from '@nexoio/db';

type Env = { Bindings: { DATABASE_URL: string } };
const app = new Hono<Env>();
const reserved = new Set(['nexoio.com.br','www.nexoio.com.br','app.nexoio.com.br','admin.nexoio.com.br','api.nexoio.com.br']);
const escape = (s: string) => s.replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]!));

app.get('*', async (c) => {
  const host = new URL(c.req.url).hostname.toLowerCase();
  if (reserved.has(host)) return c.notFound();
  const suffix = host.endsWith('.staging.nexoio.com.br') ? '.staging.nexoio.com.br' : '.nexoio.com.br';
  if (!host.endsWith(suffix)) return c.text('Host inválido', 400);
  const slug = host.slice(0, -suffix.length);
  if (!/^[a-z0-9-]+$/.test(slug)) return c.notFound();
  const rows = await createDb(c.env.DATABASE_URL).select({ name: businesses.displayName, primary: businesses.primaryColor, headline: businessPublicProfiles.headline, description: businessPublicProfiles.description, theme: businessPublicProfiles.themeJson, seo: businessPublicProfiles.seoJson })
    .from(businesses).innerJoin(businessPublicProfiles, eq(businessPublicProfiles.businessId, businesses.id))
    .where(and(eq(businesses.publicSlug, slug), eq(businesses.status, 'active'), eq(businessPublicProfiles.published, true))).limit(1);
  const site = rows[0]; if (!site) return c.notFound();
  const title = escape(site.name); const headline = escape(site.headline ?? site.name); const description = escape(site.description ?? ''); const color = /^#[0-9a-f]{6}$/i.test(site.primary ?? '') ? site.primary : '#5b3df5';
  c.header('cache-control', 'public, max-age=300, s-maxage=900');
  c.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; base-uri 'none'; frame-ancestors 'none'");
  return c.html(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><meta name="description" content="${description}"><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui;color:#171721;background:#faf9ff}main{min-height:100vh;display:grid;place-items:center;padding:32px}.card{max-width:780px;padding:64px;border:1px solid #e7e3f7;border-radius:32px;background:white;box-shadow:0 24px 80px #32208012}.mark{width:48px;height:8px;border-radius:99px;background:${color}}h1{font-size:clamp(2.5rem,7vw,5rem);line-height:1;margin:.55em 0 .25em;letter-spacing:-.05em}p{font-size:1.2rem;color:#62606c}small{display:block;margin-top:48px;color:#898694}</style></head><body><main><section class="card"><div class="mark"></div><h1>${headline}</h1><p>${description}</p><small>Site criado com Nexoio</small></section></main></body></html>`);
});
export default app;
