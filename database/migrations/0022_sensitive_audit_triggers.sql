CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION nexoio_audit_sensitive_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
  source_row jsonb;
  v_business_id uuid;
  v_entity_id uuid;
BEGIN
  old_row := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  new_row := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  source_row := COALESCE(new_row, old_row, '{}'::jsonb);

  IF COALESCE(source_row->>'business_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_business_id := (source_row->>'business_id')::uuid;
  ELSE
    v_business_id := NULL;
  END IF;

  IF COALESCE(source_row->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_entity_id := (source_row->>'id')::uuid;
  ELSIF COALESCE(source_row->>'business_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_entity_id := (source_row->>'business_id')::uuid;
  ELSE
    v_entity_id := NULL;
  END IF;

  INSERT INTO audit_logs(
    id,business_id,action,entity_type,entity_id,before_json,after_json,created_at
  ) VALUES (
    gen_random_uuid(),v_business_id,
    'db.' || TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,v_entity_id,old_row,new_row,now()
  );

  RETURN COALESCE(NEW,OLD);
END;
$$;

DO $$
DECLARE
  table_name text;
  trigger_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'financial_accounts','cash_sessions','cash_movements','sales','sale_payments','payment_refunds',
    'patients','clinical_records','clinical_procedures',
    'business_public_profiles','business_domains','subscriptions','business_quotas',
    'platform_support_tickets','platform_incidents','platform_templates','platform_finance_entries',
    'membership_permission_overrides','role_policy_limits'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      trigger_name := 'audit_' || table_name || '_changes';
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, table_name);
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION nexoio_audit_sensitive_row()',
        trigger_name, table_name
      );
    END IF;
  END LOOP;
END;
$$;
