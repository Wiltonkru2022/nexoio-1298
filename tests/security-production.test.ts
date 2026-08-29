import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { isCriticalMutation } from '../workers/api/src/security';

const connection=process.env.DATABASE_URL?postgres(process.env.DATABASE_URL,{max:1}):null;
afterAll(async()=>{if(connection)await connection.end()});

describe('critical security policy',()=>{
  it('requires MFA classification for sensitive mutations',()=>{
    expect(isCriticalMutation('POST','/api/v1/billing/checkout')).toBe(true);
    expect(isCriticalMutation('PATCH','/api/v1/finance/accounts/abc/settle')).toBe(true);
    expect(isCriticalMutation('POST','/api/v1/patients/abc/records')).toBe(true);
    expect(isCriticalMutation('PATCH','/api/v1/platform/business/public-site')).toBe(true);
    expect(isCriticalMutation('POST','/api/v1/service-orders/abc/payment')).toBe(true);
    expect(isCriticalMutation('GET','/api/v1/finance/accounts')).toBe(false);
    expect(isCriticalMutation('POST','/api/v1/products')).toBe(false);
  });

  it('has database transaction functions installed by migrations',async()=>{
    if(!connection)return;
    const rows=await connection<{proname:string}[]>`
      select proname from pg_proc
      where proname in ('create_order_transactional','close_order_transactional','cancel_order_transactional','refund_sale_transactional')
    `;
    const names=new Set(rows.map(row=>row.proname));
    expect(names.has('create_order_transactional')).toBe(true);
    expect(names.has('close_order_transactional')).toBe(true);
    expect(names.has('cancel_order_transactional')).toBe(true);
    expect(names.has('refund_sale_transactional')).toBe(true);
  });

  it('enforces webhook idempotency at database level',async()=>{
    if(!connection)return;
    const rows=await connection<{indexdef:string}[]>`
      select indexdef from pg_indexes where tablename='webhook_events'
    `;
    expect(rows.some(row=>/unique/i.test(row.indexdef)&&/provider/i.test(row.indexdef)&&/external_event_id/i.test(row.indexdef))).toBe(true);
  });

  it('keeps tenant columns on sensitive operational tables',async()=>{
    if(!connection)return;
    const rows=await connection<{table_name:string}[]>`
      select table_name from information_schema.columns
      where table_schema='public' and column_name='business_id'
        and table_name in ('orders','service_orders','patients','clinical_records','financial_accounts','inventory_balances','subscriptions')
    `;
    expect(new Set(rows.map(row=>row.table_name))).toEqual(new Set(['orders','service_orders','patients','clinical_records','financial_accounts','inventory_balances','subscriptions']));
  });
});
