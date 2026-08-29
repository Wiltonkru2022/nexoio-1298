-- Post the real inventory cost consumed by service-order parts to the accounting ledger.
-- One expense entry is maintained per service_order_part, aggregating all FEFO/FIFO cost allocations.

CREATE OR REPLACE FUNCTION nexoio_post_service_order_part_cost_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_amount numeric(14,2);
  v_competence_date date;
  v_category_id uuid;
  v_chart_account_id uuid;
  v_order_number bigint;
  v_part_description text;
BEGIN
  SELECT
    round(coalesce(sum(a.total_cost),0)::numeric,2),
    min(a.created_at)::date
  INTO v_amount,v_competence_date
  FROM service_order_part_cost_allocations a
  WHERE a.business_id=NEW.business_id
    AND a.service_order_part_id=NEW.service_order_part_id;

  IF coalesce(v_amount,0)<=0 THEN
    RETURN NEW;
  END IF;

  PERFORM nexoio_assert_accounting_period_open(NEW.business_id,v_competence_date);

  SELECT so.number,sop.description
  INTO v_order_number,v_part_description
  FROM service_order_parts sop
  JOIN service_orders so
    ON so.id=sop.service_order_id
   AND so.business_id=sop.business_id
  WHERE sop.id=NEW.service_order_part_id
    AND sop.business_id=NEW.business_id;

  SELECT fc.id,fc.chart_account_id
  INTO v_category_id,v_chart_account_id
  FROM financial_categories fc
  WHERE fc.business_id=NEW.business_id
    AND fc.kind IN ('expense','both')
    AND fc.active=true
  ORDER BY (fc.chart_account_id IS NOT NULL) DESC,fc.created_at,fc.id
  LIMIT 1;

  INSERT INTO financial_ledger(
    id,business_id,entry_type,source_type,source_id,
    category_id,chart_account_id,description,amount,
    competence_date,cash_date,status,created_by
  )
  VALUES(
    gen_random_uuid(),NEW.business_id,'expense','service_order_part',NEW.service_order_part_id,
    v_category_id,v_chart_account_id,
    'Custo de peça OS #'||coalesce(v_order_number::text,'—')||' · '||coalesce(v_part_description,'Peça'),
    v_amount,v_competence_date,NULL,'posted',NULL
  )
  ON CONFLICT (business_id,source_type,source_id,entry_type) WHERE source_id IS NOT NULL
  DO UPDATE SET
    category_id=EXCLUDED.category_id,
    chart_account_id=EXCLUDED.chart_account_id,
    description=EXCLUDED.description,
    amount=EXCLUDED.amount,
    competence_date=EXCLUDED.competence_date,
    status='posted';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS post_service_order_part_cost_ledger ON service_order_part_cost_allocations;
CREATE TRIGGER post_service_order_part_cost_ledger
AFTER INSERT OR UPDATE OF quantity,unit_cost,total_cost
ON service_order_part_cost_allocations
FOR EACH ROW
EXECUTE FUNCTION nexoio_post_service_order_part_cost_ledger();

-- Backfill historical allocations only when their competence date is not inside a closed accounting period.
-- Closed periods are intentionally immutable; they can be reconciled later through an explicit accounting adjustment.
INSERT INTO financial_ledger(
  id,business_id,entry_type,source_type,source_id,
  category_id,chart_account_id,description,amount,
  competence_date,cash_date,status,created_by
)
SELECT
  gen_random_uuid(),
  grouped.business_id,
  'expense',
  'service_order_part',
  grouped.service_order_part_id,
  category.id,
  category.chart_account_id,
  'Custo de peça OS #'||coalesce(grouped.order_number::text,'—')||' · '||coalesce(grouped.part_description,'Peça'),
  grouped.amount,
  grouped.competence_date,
  NULL,
  'posted',
  NULL
FROM (
  SELECT
    a.business_id,
    a.service_order_part_id,
    round(sum(a.total_cost)::numeric,2) AS amount,
    min(a.created_at)::date AS competence_date,
    max(so.number) AS order_number,
    max(sop.description) AS part_description
  FROM service_order_part_cost_allocations a
  JOIN service_order_parts sop
    ON sop.id=a.service_order_part_id
   AND sop.business_id=a.business_id
  JOIN service_orders so
    ON so.id=sop.service_order_id
   AND so.business_id=sop.business_id
  GROUP BY a.business_id,a.service_order_part_id
) grouped
LEFT JOIN LATERAL (
  SELECT fc.id,fc.chart_account_id
  FROM financial_categories fc
  WHERE fc.business_id=grouped.business_id
    AND fc.kind IN ('expense','both')
    AND fc.active=true
  ORDER BY (fc.chart_account_id IS NOT NULL) DESC,fc.created_at,fc.id
  LIMIT 1
) category ON true
WHERE grouped.amount>0
  AND NOT EXISTS (
    SELECT 1
    FROM accounting_periods ap
    WHERE ap.business_id=grouped.business_id
      AND ap.status='closed'
      AND grouped.competence_date BETWEEN ap.starts_on AND ap.ends_on
  )
ON CONFLICT (business_id,source_type,source_id,entry_type) WHERE source_id IS NOT NULL
DO UPDATE SET
  category_id=EXCLUDED.category_id,
  chart_account_id=EXCLUDED.chart_account_id,
  description=EXCLUDED.description,
  amount=EXCLUDED.amount,
  competence_date=EXCLUDED.competence_date,
  status='posted';
