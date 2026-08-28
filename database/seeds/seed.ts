try { process.loadEnvFile?.(); } catch { /* DATABASE_URL may already be injected by CI. */ }
import postgres from 'postgres';
import { PERMISSIONS, ROLE_PERMISSIONS } from '@nexoio/permissions';
import { CORE_MODULES, MODULE_DEPENDENCIES, MODULES, uuidv7 } from '@nexoio/core';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const db = postgres(url, { max: 1 });

await db.begin(async (sql) => {
  await sql`insert into platform_company (id, legal_name, trade_name, document_type, document_number) values (${uuidv7()}, ${'68.687.704 WILTON PEREIRA KRUSZCIAKO'}, 'Nexoio', 'CNPJ', '68.687.704/0001-18') on conflict (document_number) do update set legal_name = excluded.legal_name, trade_name = excluded.trade_name`;
  for (const code of PERMISSIONS) await sql`insert into permissions (code, description) values (${code}, ${code.replace('.', ': ')}) on conflict (code) do nothing`;
  for (const [code, grants] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = uuidv7();
    const [role] = await sql<{id:string}[]>`insert into roles (id, code, name, is_system) values (${roleId}, ${code}, ${code[0]!.toUpperCase()+code.slice(1)}, true) on conflict (business_id, code) do update set name=excluded.name returning id`;
    for (const permission of grants) await sql`insert into role_permissions (role_id, permission_code) values (${role!.id}, ${permission}) on conflict do nothing`;
  }
  const plans = [{code:'start',name:'Start',price:'0'},{code:'pro',name:'Pro',price:'99.90'},{code:'business',name:'Business',price:'199.90'}];
  for (const plan of plans) await sql`insert into plans (id, code, name, price_monthly) values (${uuidv7()}, ${plan.code}, ${plan.name}, ${plan.price}) on conflict (code) do update set name=excluded.name`;
  for (const module of MODULES) await sql`insert into modules (key, name, description, core, dependencies_json) values (${module}, ${module.replaceAll('_',' ')}, ${`Módulo ${module} da plataforma Nexoio`}, ${CORE_MODULES.includes(module)}, ${sql.json(MODULE_DEPENDENCIES[module] ?? [])}) on conflict (key) do update set dependencies_json=excluded.dependencies_json`;
});
await db.end();
console.log('Structural seed completed');
