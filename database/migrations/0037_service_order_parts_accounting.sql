-- Post real inventory cost consumed by service-order parts into the accounting ledger.
-- One ledger source per service_order_part keeps costs idempotent and auditable.

CREATE OR REPLACE FUNCTION nexoio_post_service_order_part_cost()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_category uuid;
  v_chart uuid;
  v_amount numeric(14,4);
  v_description text;
  v_competence date;
BEGIN
  v_competence := NEW.created_at::date;
  PERFORM nexoio_assert_accounting_period_open(NEW.business_id,v_competence);

  SELECT fc.id,fc.chart_account_id
    INTO v_category,v_chart
  FROM financial_categories fc
  WHERE fc.business_id=NEW.business_id
    AND fc.kind IN ('expense','both')
    AND fc.active=true
  ORDER BY (fc.chart_account_id IS NOT NULL) DESC,fc.created_at
  LIMIT 1;

  SELECT
    COALESCE(sum(a.total_cost),0),
    'Custo de peça · OS #'||so.number::text||' · '||sop.description
  INTO v_amount,v_description
  FROM service_order_part_cost_allocations a
  JOIN service_order_parts sop
    ON sop.id=a.service_order_part_id
   AND sop.business_id=a.business_id
  JOIN service_orders so
    ON so.id=sop.service_order_id
   AND so.business_id=sop.business_id
  WHERE a.business_id=NEW.business_id
    AND a.service_order_part_id=NEW.service_order_part_id
  GROUP BY so.number,sop.description;

  IF COALESCE(v_amount,0)<=0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO financial_ledger(
    id,business_id,entry_type,source_type,source_id,category_id,chart_account_id,
    description,amount,competence_date,cash_date,status,created_by
  )
  VALUES(
    gen_random_uuid(),NEW.business_id,'expense','service_order_part',NEW.service_order_part_id,
    v_category,v_chart,COALESCE(v_description,'Custo de peça em ordem de serviço'),v_amount,
    v_competence,NULL,'posted',NULL
  )
  ON CONFLICT (business_id,source_type,source_id,entry_type) WHERE source_id IS NOT NULL
  DO UPDATE SET
    category_id=EXCLUDED.category_id,
    chart_account_id=EXCLUDED.chart_account_id,
    description=EXCLUDED.description,
    amount=EXCLUDED.amount,
    competence_date=LEAST(financial_ledger.competence_date,EXCLUDED.competence_date),
    status='posted';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS post_service_order_part_cost ON service_order_part_cost_allocations;
CREATE TRIGGER post_service_order_part_cost
AFTER INSERT OR UPDATE OF quantity,unit_cost,total_cost
ON service_order_part_cost_allocations
FOR EACH ROW
EXECUTE FUNCTION nexoio_post_service_order_part_cost();

CREATE OR REPLACE FUNCTION nexoio_reverse_service_order_part_cost()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='cancelled' THEN
    UPDATE financial_ledger fl
    SET status='reversed'
    WHERE fl.business_id=NEW.business_id
      AND fl.source_type='service_order_part'
      AND fl.entry_type='expense'
      AND fl.source_id IN (
        SELECT sop.id
        FROM service_order_parts sop
        WHERE sop.business_id=NEW.business_id
          AND sop.service_order_id=NEW.id
      )
      AND fl.status<>'reversed';
  ELSIF OLD.status='cancelled' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status<>'cancelled' THEN
    UPDATE financial_ledger fl
    SET status='posted'
    WHERE fl.business_id=NEW.business_id
      AND fl.source_type='service_order_part'
      AND fl.entry_type='expense'
      AND fl.source_id IN (
        SELECT sop.id
        FROM service_order_parts sop
        WHERE sop.business_id=NEW.business_id
          AND sop.service_order_id=NEW.id
      )
      AND fl.status='reversed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reverse_service_order_part_cost ON service_orders;
CREATE TRIGGER reverse_service_order_part_cost
AFTER UPDATE OF status ON service_orders
FOR EACH ROW
EXECUTE FUNCTION nexoio_reverse_service_order_part_cost();

-- Backfill only periods that are not already closed. Closed books are never rewritten by migration.
WITH grouped AS (
  SELECT
    a.business_id,
    a.service_order_part_id,
    so.number AS service_order_number,
    sop.description,
    so.status AS service_order_status,
    sum(a.total_cost) AS amount,
    min(a.created_at)::date AS competence_date
  FROM service_order_part_cost_allocations a
  JOIN service_order_parts sop
    ON sop.id=a.service_order_part_id
   AND sop.business_id=a.business_id
  JOIN service_orders so
    ON so.id=sop.service_order_id
   AND so.business_id=sop.business_id
  GROUP BY a.business_id,a.service_order_part_id,so.number,sop.description,so.status
)
INSERT INTO financial_ledger(
  id,business_id,entry_type,source_type,source_id,category_id,chart_account_id,
  description,amount,competence_date,cash_date,status,created_by
)
SELECT
  gen_random_uuid(),
  g.business_id,
  'expense',
  'service_order_part',
  g.service_order_part_id,
  fc.id,
  fc.chart_account_id,
  'Custo de peça · OS #'||g.service_order_number::text||' · '||g.description,
  g.amount,
  g.competence_date,
  NULL,
  CASE WHEN g.service_order_status='cancelled' THEN 'reversed' ELSE 'posted' END,
  NULL
FROM grouped g
LEFT JOIN LATERAL (
  SELECT c.id,c.chart_account_id
  FROM financial_categories c
  WHERE c.business_id=g.business_id
    AND c.kind IN ('expense','both')
    AND c.active=true
  ORDER BY (c.chart_account_id IS NOT NULL) DESC,c.created_at
  LIMIT 1
) fc ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM accounting_periods ap
  WHERE ap.business_id=g.business_id
    AND ap.status='closed'
    AND g.competence_date BETWEEN ap.starts_on AND ap.ends_on
)
ON CONFLICT (business_id,source_type,source_id,entry_type) WHERE source_id IS NOT NULL
DO UPDATE SET
  category_id=EXCLUDED.category_id,
  chart_account_id=EXCLUDED.chart_account_id,
  description=EXCLUDED.description,
  amount=EXCLUDED.amount,
  competence_date=EXCLUDED.competence_date,
  status=EXCLUDED.status;
