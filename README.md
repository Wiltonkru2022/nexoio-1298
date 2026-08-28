# Nexoio

Fundação do SaaS multiempresa Nexoio conforme a arquitetura-mestra: React/Vite, Cloudflare Workers, Hono, Better Auth, Neon PostgreSQL, Drizzle e R2.

## Estrutura

- `apps/marketing`: site institucional;
- `apps/merchant`: painel do comerciante;
- `apps/admin`: painel Master;
- `apps/public-site`: preview do template público;
- `workers/api`: API privada, auth, RBAC e recursos do negócio;
- `workers/public-site`: resolução segura de `*.nexoio.com.br`;
- `packages/db`: schema oficial único;
- `database`: migrations, seed e scripts;
- `tests`: garantias unitárias, incluindo isolamento de tenant.

Consulte `docs/DEPLOYMENT.md` para configurar Neon, Cloudflare e os ambientes.
