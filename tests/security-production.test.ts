import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { isCriticalMutation } from '../workers/api/src/security';

const connection=process.env.DATABASE_URL?postgres(process.env.DATABASE_URL,{max:4}):null;
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

  it('locks order and inventory state inside transactional functions',async()=>{
    if(!connection)return;
    const rows=await connection<{proname:string;definition:string}[]>`
      select p.proname, pg_get_functiondef(p.oid) definition
      from pg_proc p
      where p.proname in ('create_order_transactional','close_order_transactional')
    `;
    const definitions=rows.map(row=>row.definition.toLowerCase()).join('\n');
    expect(definitions).toContain('inventory');
    expect(definitions).toMatch(/for\s+update|inventory_reservations/);
  });

  it('enforces webhook idempotency with an actual duplicate insert',async()=>{
    if(!connection)return;
    const eventId=`ci-${crypto.randomUUID()}`;
    await connection`insert into webhook_events(id,provider,external_event_id,event_type,payload,status,received_at) values(${crypto.randomUUID()}::uuid,'ci-test',${eventId},'TEST','{}'::jsonb,'processed',now())`;
    let duplicate=false;
    try{
      await connection`insert into webhook_events(id,provider,external_event_id,event_type,payload,status,received_at) values(${crypto.randomUUID()}::uuid,'ci-test',${eventId},'TEST','{}'::jsonb,'processed',now())`;
    }catch{duplicate=true}
    await connection`delete from webhook_events where provider='ci-test' and external_event_id=${eventId}`;
    expect(duplicate).toBe(true);
  });

  it('keeps tenant columns on sensitive operational tables',async()=>{
    if(!connection)return;
    const expected=['orders','service_orders','patients','clinical_records','payables','receivables','inventory_balances','subscriptions'];
    const rows=await connection<{table_name:string}[]>`
      select table_name from information_schema.columns
      where table_schema='public' and column_name='business_id'
        and table_name in ('orders','service_orders','patients','clinical_records','payables','receivables','inventory_balances','subscriptions')
    `;
    expect(new Set(rows.map(row=>row.table_name))).toEqual(new Set(expected));
  });

  it('installs before-after audit triggers for sensitive tables',async()=>{
    if(!connection)return;
    const rows=await connection<{relname:string}[]>`
      select c.relname
      from pg_trigger t join pg_class c on c.oid=t.tgrelid
      where not t.tgisinternal and t.tgname like 'audit_%_changes'
    `;
    const names=new Set(rows.map(row=>row.relname));
    for(const table of ['payables','receivables','cash_sessions','sales','patients','clinical_records','business_public_profiles','business_domains','subscriptions'])expect(names.has(table)).toBe(true);
  });

  it('records before and after images at database level',async()=>{
    if(!connection)return;
    const businessId=crypto.randomUUID();
    const slug=`ci-${businessId.slice(0,8)}`;
    await connection`insert into businesses(id,display_name,public_slug,business_type,status) values(${businessId}::uuid,'CI Audit Tenant',${slug},'other','active')`;
    await connection`insert into business_public_profiles(business_id,headline,theme_json,seo_json,published) values(${businessId}::uuid,'Antes','{}'::jsonb,'{}'::jsonb,false)`;
    await connection`update business_public_profiles set headline='Depois' where business_id=${businessId}::uuid`;
    const rows=await connection<{before_json:any;after_json:any}[]>`
      select before_json,after_json from audit_logs
      where business_id=${businessId}::uuid and action='db.business_public_profiles.update'
      order by created_at desc limit 1
    `;
    expect(rows[0]?.before_json?.headline).toBe('Antes');
    expect(rows[0]?.after_json?.headline).toBe('Depois');
    await connection`delete from business_public_profiles where business_id=${businessId}::uuid`;
    await connection`delete from audit_logs where business_id=${businessId}::uuid`;
    await connection`delete from businesses where id=${businessId}::uuid`;
  });

  it('isolates tenant-owned product queries in the real database',async()=>{
    if(!connection)return;
    const a=crypto.randomUUID(),b=crypto.randomUUID();
    await connection`insert into businesses(id,display_name,public_slug,business_type,status) values(${a}::uuid,'Tenant A',${`a-${a.slice(0,8)}`},'other','active'),(${b}::uuid,'Tenant B',${`b-${b.slice(0,8)}`},'other','active')`;
    const productA=crypto.randomUUID(),productB=crypto.randomUUID();
    await connection`insert into products(id,business_id,name,sale_price,stock_control_enabled,active) values(${productA}::uuid,${a}::uuid,'Produto A',10,false,true),(${productB}::uuid,${b}::uuid,'Produto B',20,false,true)`;
    const rows=await connection<{id:string}[]>`select id from products where business_id=${a}::uuid order by id`;
    expect(rows.map(row=>row.id)).toContain(productA);
    expect(rows.map(row=>row.id)).not.toContain(productB);
    await connection`delete from products where business_id in (${a}::uuid,${b}::uuid)`;
    await connection`delete from businesses where id in (${a}::uuid,${b}::uuid)`;
  });
});
