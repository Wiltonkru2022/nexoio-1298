# Deploy do Nexoio

## Pré-requisitos externos

O repositório está pronto, mas recursos de conta não são criados sem credenciais. No Neon, crie o projeto `nexoio`, branches `production`, `staging` e `development`, e roles separadas `nexoio_app`, `nexoio_migrations` e `nexoio_readonly`. Use URLs diferentes por ambiente.

No Cloudflare, adicione `nexoio.com.br`, ative SSL **Full (strict)** e Always HTTPS, configure os hostnames `@`, `www`, `app`, `admin`, `api` e `*`, e crie os buckets `nexoio-prod`, `nexoio-staging` e `nexoio-development`.

## Desenvolvimento

1. Copie `.env.example` para `.dev.vars` dentro de `workers/api` e `workers/public-site`.
2. Preencha `DATABASE_URL`, `AUTH_SECRET` (mínimo de 32 caracteres) e `AUTH_URL`.
3. Revise a migration baseline versionada. Para alterações futuras, rode `npm run db:generate` e revise o SQL gerado.
4. Rode `npm run db:migrate` e `npm run db:seed`.
5. Inicie com `npm run dev:api` e `npm run dev:merchant`.

## Secrets de produção

Dentro de cada Worker relevante, execute `npx wrangler secret put DATABASE_URL --env production` e, para a API, também `npx wrangler secret put AUTH_SECRET --env production` e `npx wrangler secret put TURNSTILE_SECRET --env production`.

Nunca use a URL de produção localmente. O deploy automatizado espera `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `DATABASE_URL_PRODUCTION` nos secrets do GitHub.

## Recuperação

Antes do primeiro cliente pagante: configure a janela de restore do plano Neon, simule um incidente em staging, crie uma branch a partir do ponto no tempo anterior, valide contagens e integridade, e documente o tempo real de recuperação. Não execute rollback destrutivo automático de migrations.
