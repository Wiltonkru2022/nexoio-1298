-- Extend database-level before/after auditing to the remaining sensitive
-- finance, commission and inventory control tables.
DO $$
DECLARE
  table_name text;
  trigger_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'payables','receivables','financial_categories','chart_accounts',
    'bank_accounts','bank_transactions','financial_ledger',
    'commissions','commission_batches','commission_batch_items',
    'inventory_counts','inventory_count_items','inventory_transfers','inventory_transfer_items'
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
