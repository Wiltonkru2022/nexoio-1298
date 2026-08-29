import { expect, test, type Page, type Route } from '@playwright/test';

const apiOrigin = 'http://localhost:8787';
const now = '2026-08-29T04:00:00.000Z';
const businessId = '11111111-1111-4111-8111-111111111111';

const fullPermissions = [
  'inventory.read','inventory.write','products.read','finance.read','finance.create','settings.read','settings.update',
  'customers.read','appointments.read','sales.read','cash.read','team.read','public_site.read','public_site.update',
];
const modules = ['overview','inventory','products','finance','settings','customers','schedule','sales','cash','team','public_site'];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockMerchant(page: Page, options: { restricted?: boolean; procurementError?: boolean } = {}) {
  await page.route(`${apiOrigin}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/v1/platform/context') {
      return json(route, { data: {
        user: { id: 'user-1', name: 'QA Merchant', email: 'qa@nexoio.local' },
        memberships: [{ businessId, businessName: 'Empresa QA', segment: 'retail', status: 'active', roleId: '22222222-2222-4222-8222-222222222222', roleCode: options.restricted ? 'viewer' : 'manager' }],
        activeBusiness: { businessId, businessName: 'Empresa QA', segment: 'retail', status: 'active', roleId: '22222222-2222-4222-8222-222222222222', roleCode: options.restricted ? 'viewer' : 'manager' },
        permissions: options.restricted ? ['inventory.read'] : fullPermissions,
        modules,
        onboardingRequired: false,
      }});
    }
    if (options.procurementError && path === '/api/v1/purchase-orders') {
      return json(route, { error: { code: 'QA_FAILURE', message: 'Falha simulada de compras' } }, 500);
    }
    const get: Record<string, unknown> = {
      '/api/v1/inventory/balances': { data: [{ id: 'bal-1', product_name: 'Shampoo QA', location_name: 'Principal', on_hand: 20, reserved: 2, available: 18 }] },
      '/api/v1/inventory/locations': { data: [{ id: '33333333-3333-4333-8333-333333333333', name: 'Principal' }] },
      '/api/v1/products': { data: [{ id: '44444444-4444-4444-8444-444444444444', name: 'Shampoo QA' }] },
      '/api/v1/suppliers': { data: [{ id: '55555555-5555-4555-8555-555555555555', name: 'Fornecedor QA', active: true }] },
      '/api/v1/purchase-orders': { data: [{ id: '66666666-6666-4666-8666-666666666666', supplier_name: 'Fornecedor QA', location_id: '33333333-3333-4333-8333-333333333333', location_name: 'Principal', status: 'ordered', ordered_on: '2026-08-29', total: 120, items: [] }] },
      '/api/v1/inventory/costs': { data: [{ location_id: '33333333-3333-4333-8333-333333333333', location_name: 'Principal', product_id: '44444444-4444-4444-8444-444444444444', product_name: 'Shampoo QA', average_cost: 12, quantity_on_hand: 20 }] },
      '/api/v1/inventory/expiry-report': { data: { items: [{ product_name: 'Shampoo QA', location_name: 'Principal', lot_code: 'LQA-01', expiration_date: '2026-09-15', on_hand: 10, reserved: 1 }] } },
      '/api/v1/finance/accounts': { data: [{ id: '77777777-7777-4777-8777-777777777777', kind: 'receivable', description: 'Mensalidade QA', amount: '500.00', settled_amount: '100.00', due_date: '2026-08-30', status: 'open' }] },
      '/api/v1/finance/summary': { data: { payable_open: '200.00', receivable_open: '400.00', cash_net: '1000.00', commissions_pending: '80.00' } },
      '/api/v1/finance/accounting-periods': { data: [{ id: '88888888-8888-4888-8888-888888888888', starts_on: '2026-08-01', ends_on: '2026-08-31', status: 'open', notes: 'Agosto QA' }] },
    };
    if (path === '/api/v1/finance/reports/dre') return json(route, { data: { basis: url.searchParams.get('basis') ?? 'competence', from: '2026-08-01', to: '2026-08-29', lines: [{ code: '3.1', name: 'Receita de vendas', account_type: 'revenue', amount: 1500 }, { code: '4.1', name: 'Despesas', account_type: 'expense', amount: -400 }], net: 1100 } });
    if (request.method() === 'GET' && path in get) return json(route, get[path]);
    if (request.method() === 'GET') return json(route, { data: [] });
    return json(route, { data: { ok: true } });
  });
}

async function mockAdmin(page: Page) {
  await page.route(`${apiOrigin}/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const get: Record<string, unknown> = {
      '/api/v1/admin/businesses': { data: [{ id: businessId, displayName: 'Empresa QA', publicSlug: 'empresa-qa', businessType: 'retail', status: 'active', createdAt: now }] },
      '/api/v1/admin/plans': { data: [{ id: '99999999-9999-4999-8999-999999999999', name: 'Pro', code: 'pro', priceMonthly: '149.90', active: true }] },
      '/api/v1/admin/audit': { data: [] },
      '/api/v1/admin/subscriptions/operations': { data: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', business_id: businessId, business_name: 'Empresa QA', plan_id: '99999999-9999-4999-8999-999999999999', plan_name: 'Pro', status: 'active', current_period_end: '2026-09-29T00:00:00.000Z', provider: 'asaas' }] },
      '/api/v1/admin/usage/operations': { data: [{ business_id: businessId, business_name: 'Empresa QA', metric: 'storage_bytes', period: '2026-08-01', value: 1048576, storage_limit_bytes: 104857600 }] },
      '/api/v1/admin/domains/operations': { data: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', business_name: 'Empresa QA', hostname: 'www.empresaqa.com.br', verification_status: 'verified', ssl_status: 'active', provider: 'cloudflare', updated_at: now }] },
      '/api/v1/admin/sites/operations': { data: [{ business_id: businessId, business_name: 'Empresa QA', slug: 'empresa-qa', published: true, headline: 'Empresa QA', updated_at: now }] },
      '/api/v1/admin/users/operations': { data: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', auth_user_id: 'auth-qa', name: 'Usuário QA', email: 'usuario@nexoio.local', status: 'active', email_verified: true, two_factor_enabled: true, memberships: 1, created_at: now }] },
      '/api/v1/admin/modules/operations': { data: [{ key: 'inventory', name: 'Estoque', description: 'Controle de estoque', core: false, active: true, businesses_enabled: 1 }] },
      [`/api/v1/admin/businesses/${businessId}/modules`]: { data: [{ key: 'inventory', name: 'Estoque', core: false, active: true, enabled: true, source: 'master', dependencies: [] }] },
      '/api/v1/admin/plans/operations': { data: [{ id: '99999999-9999-4999-8999-999999999999', name: 'Pro', code: 'pro', price_monthly: '149.90', active: true, trial_days: 7, subscriptions: 12 }] },
    };
    if (request.method() === 'GET' && path in get) return json(route, get[path]);
    if (request.method() === 'GET') return json(route, { data: [] });
    return json(route, { data: { ok: true, status: 'active' } });
  });
}

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
}

async function exerciseMobileMenu(page: Page) {
  if ((page.viewportSize()?.width ?? 1000) > 850) return;
  const toggle = page.getByRole('button', { name: 'Abrir menu' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByLabel('Navegação principal')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fechar menu' }).first()).toBeVisible();
}

test.describe('Merchant - fluxos críticos e responsividade', () => {
  test('estoque mostra saldo, compras, custo e validade sem estouro', async ({ page }) => {
    await mockMerchant(page);
    await page.goto('http://127.0.0.1:5173/estoque');
    await expect(page.getByText('Compras e recebimentos')).toBeVisible();
    await expect(page.getByText('Custo médio por estoque')).toBeVisible();
    await expect(page.getByText('Lotes próximos do vencimento')).toBeVisible();
    await expect(page.getByText('Fornecedor QA')).toBeVisible();
    await exerciseMobileMenu(page);
    await expectNoPageOverflow(page);
  });

  test('financeiro mostra contas, DRE e fechamento contábil', async ({ page }) => {
    await mockMerchant(page);
    await page.goto('http://127.0.0.1:5173/financeiro');
    await expect(page.getByRole('heading', { name: 'Financeiro' })).toBeVisible();
    await expect(page.getByText('DRE', { exact: true })).toBeVisible();
    await expect(page.getByText('Resultado')).toBeVisible();
    await expect(page.getByText('Fechamento contábil')).toBeVisible();
    await expect(page.getByText('Agosto QA')).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test('rota sem permissão exibe 403 visual', async ({ page }) => {
    await mockMerchant(page, { restricted: true });
    await page.goto('http://127.0.0.1:5173/financeiro');
    await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
    await expect(page.getByText('Sua conta não possui permissão')).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test('erro de API aparece como estado de erro e não quebra a página', async ({ page }) => {
    await mockMerchant(page, { procurementError: true });
    await page.goto('http://127.0.0.1:5173/estoque');
    await expect(page.getByRole('alert')).toContainText('Falha simulada de compras');
    await expect(page.getByRole('heading', { name: 'Estoque' })).toBeVisible();
    await expectNoPageOverflow(page);
  });
});

test.describe('Admin Master - operação real e responsividade', () => {
  test.beforeEach(async ({ page }) => { await mockAdmin(page); });

  test('assinaturas permitem operação de plano e status', async ({ page }) => {
    await page.goto('http://127.0.0.1:5174/assinaturas');
    await expect(page.getByText('Assinaturas', { exact: true })).toBeVisible();
    await expect(page.getByText('Empresa QA')).toBeVisible();
    await expect(page.getByRole('combobox').first()).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test('domínios exibem estado Cloudflare e ações reais', async ({ page }) => {
    await page.goto('http://127.0.0.1:5174/dominios');
    await expect(page.getByText('www.empresaqa.com.br')).toBeVisible();
    await expect(page.getByRole('button', { name: /Revalidar/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Remover/i })).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test('usuários mostram MFA e ação de suspensão', async ({ page }) => {
    await page.goto('http://127.0.0.1:5174/usuarios');
    await expect(page.getByText('Usuário QA')).toBeVisible();
    await expect(page.getByText('usuario@nexoio.local')).toBeVisible();
    await expect(page.getByRole('button', { name: /Suspender/i })).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test('módulos carregam catálogo e navegação móvel', async ({ page }) => {
    await page.goto('http://127.0.0.1:5174/modulos');
    await expect(page.getByText('Estoque')).toBeVisible();
    await expect(page.getByText('Controle de estoque')).toBeVisible();
    await exerciseMobileMenu(page);
    await expectNoPageOverflow(page);
  });
});
