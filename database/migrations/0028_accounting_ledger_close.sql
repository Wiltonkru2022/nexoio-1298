CREATE TABLE IF NOT EXISTS accounting_periods (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_by uuid REFERENCES users(id),
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on>=starts_on),
  UNIQUE (business_id,starts_on,ends_on)
);
CREATE INDEX IF NOT EXISTS accounting_periods_business_idx ON accounting_periods(business_id,status,starts_on,ends_on);

CREATE UNIQUE INDEX IF NOT EXISTS financial_ledger_source_uidx
  ON financial_ledger(business_id,source_type,source_id,entry_type)
  WHERE source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION nexoio_assert_accounting_period_open(p_business_id uuid,p_date date)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM accounting_periods WHERE business_id=p_business_id AND status='closed' AND p_date BETWEEN starts_on AND ends_on) THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_CLOSED';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION nexoio_guard_ledger_closed_period()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM nexoio_assert_accounting_period_open(COALESCE(NEW.business_id,OLD.business_id),COALESCE(NEW.competence_date,OLD.competence_date));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_ledger_closed_period ON financial_ledger;
CREATE TRIGGER guard_ledger_closed_period BEFORE INSERT OR UPDATE ON financial_ledger FOR EACH ROW EXECUTE FUNCTION nexoio_guard_ledger_closed_period();

CREATE OR REPLACE FUNCTION nexoio_post_sale_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_cash_date date; v_category uuid; v_chart uuid;
BEGIN
  IF TG_OP='INSERT' AND NEW.status='completed' THEN
    PERFORM nexoio_assert_accounting_period_open(NEW.business_id,COALESCE(NEW.completed_at::date,NEW.created_at::date));
    SELECT fc.id,fc.chart_account_id INTO v_category,v_chart FROM financial_categories fc WHERE fc.business_id=NEW.business_id AND fc.kind IN ('income','both') AND fc.active=true ORDER BY (fc.chart_account_id IS NOT NULL) DESC,fc.created_at LIMIT 1;
    SELECT max(sp.paid_at)::date INTO v_cash_date FROM sale_payments sp WHERE sp.business_id=NEW.business_id AND sp.sale_id=NEW.id AND sp.status='paid' HAVING sum(sp.amount)>=NEW.total;
    INSERT INTO financial_ledger(id,business_id,entry_type,source_type,source_id,category_id,chart_account_id,description,amount,competence_date,cash_date,status,created_by)
    VALUES(gen_random_uuid(),NEW.business_id,'income','sale',NEW.id,v_category,v_chart,'Venda',NEW.total,COALESCE(NEW.completed_at::date,NEW.created_at::date),v_cash_date,'posted',NEW.seller_user_id)
    ON CONFLICT (business_id,source_type,source_id,entry_type) WHERE source_id IS NOT NULL DO UPDATE
      SET amount=EXCLUDED.amount,competence_date=EXCLUDED.competence_date,cash_date=COALESCE(EXCLUDED.cash_date,financial_ledger.cash_date),status='posted';
  ELSIF TG_OP='UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('cancelled','refunded','refund_pending') THEN
      UPDATE financial_ledger SET status='reversed' WHERE business_id=NEW.business_id AND source_type='sale' AND source_id=NEW.id;
    ELSIF NEW.status='completed' THEN
      UPDATE financial_ledger SET amount=NEW.total,competence_date=COALESCE(NEW.completed_at::date,NEW.created_at::date) WHERE business_id=NEW.business_id AND source_type='sale' AND source_id=NEW.id AND status<>'reversed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS post_sale_ledger ON sales;
CREATE TRIGGER post_sale_ledger AFTER INSERT OR UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION nexoio_post_sale_ledger();

CREATE OR REPLACE FUNCTION nexoio_update_sale_cash_date()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_total numeric; v_paid numeric; v_date date;
BEGIN
  IF NEW.status<>'paid' THEN RETURN NEW; END IF;
  SELECT s.total,COALESCE(sum(sp.amount) FILTER(WHERE sp.status='paid'),0),max(sp.paid_at)::date INTO v_total,v_paid,v_date
    FROM sales s LEFT JOIN sale_payments sp ON sp.sale_id=s.id AND sp.business_id=s.business_id
    WHERE s.id=NEW.sale_id AND s.business_id=NEW.business_id GROUP BY s.total;
  IF v_paid>=v_total THEN UPDATE financial_ledger SET cash_date=v_date WHERE business_id=NEW.business_id AND source_type='sale' AND source_id=NEW.sale_id AND status='posted'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS update_sale_cash_date ON sale_payments;
CREATE TRIGGER update_sale_cash_date AFTER INSERT OR UPDATE ON sale_payments FOR EACH ROW EXECUTE FUNCTION nexoio_update_sale_cash_date();

CREATE OR REPLACE FUNCTION nexoio_post_payable_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_chart uuid;
BEGIN
  PERFORM nexoio_assert_accounting_period_open(NEW.business_id,COALESCE(NEW.due_date,NEW.created_at::date));
  SELECT chart_account_id INTO v_chart FROM financial_categories WHERE id=NEW.category_id AND business_id=NEW.business_id;
  INSERT INTO financial_ledger(id,business_id,entry_type,source_type,source_id,category_id,chart_account_id,description,amount,competence_date,cash_date,status,created_by)
  VALUES(gen_random_uuid(),NEW.business_id,'expense','payable',NEW.id,NEW.category_id,v_chart,NEW.description,NEW.amount,NEW.due_date,CASE WHEN NEW.status='paid' THEN NEW.paid_at::date ELSE NULL END,'posted',NULL)
  ON CONFLICT (business_id,source_type,source_id,entry_type) WHERE source_id IS NOT NULL DO UPDATE SET category_id=EXCLUDED.category_id,chart_account_id=EXCLUDED.chart_account_id,description=EXCLUDED.description,amount=EXCLUDED.amount,competence_date=EXCLUDED.competence_date,cash_date=CASE WHEN NEW.status='paid' THEN NEW.paid_at::date ELSE financial_ledger.cash_date END,status='posted';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS post_payable_ledger ON payables;
CREATE TRIGGER post_payable_ledger AFTER INSERT OR UPDATE ON payables FOR EACH ROW EXECUTE FUNCTION nexoio_post_payable_ledger();

CREATE OR REPLACE FUNCTION nexoio_post_receivable_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_chart uuid;
BEGIN
  PERFORM nexoio_assert_accounting_period_open(NEW.business_id,COALESCE(NEW.due_date,NEW.created_at::date));
  SELECT chart_account_id INTO v_chart FROM financial_categories WHERE id=NEW.category_id AND business_id=NEW.business_id;
  INSERT INTO financial_ledger(id,business_id,entry_type,source_type,source_id,category_id,chart_account_id,description,amount,competence_date,cash_date,status,created_by)
  VALUES(gen_random_uuid(),NEW.business_id,'income','receivable',NEW.id,NEW.category_id,v_chart,NEW.description,NEW.amount,NEW.due_date,CASE WHEN NEW.status='received' THEN NEW.received_at::date ELSE NULL END,'posted',NULL)
  ON CONFLICT (business_id,source_type,source_id,entry_type) WHERE source_id IS NOT NULL DO UPDATE SET category_id=EXCLUDED.category_id,chart_account_id=EXCLUDED.chart_account_id,description=EXCLUDED.description,amount=EXCLUDED.amount,competence_date=EXCLUDED.competence_date,cash_date=CASE WHEN NEW.status='received' THEN NEW.received_at::date ELSE financial_ledger.cash_date END,status='posted';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS post_receivable_ledger ON receivables;
CREATE TRIGGER post_receivable_ledger AFTER INSERT OR UPDATE ON receivables FOR EACH ROW EXECUTE FUNCTION nexoio_post_receivable_ledger();

-- Backfill ledger from existing operational records.
INSERT INTO financial_ledger(id,business_id,entry_type,source_type,source_id,description,amount,competence_date,cash_date,status,created_by)
SELECT gen_random_uuid(),s.business_id,'income','sale',s.id,'Venda',s.total,COALESCE(s.completed_at::date,s.created_at::date),
       (SELECT max(sp.paid_at)::date FROM sale_payments sp WHERE sp.business_id=s.business_id AND sp.sale_id=s.id AND sp.status='paid' HAVING sum(sp.amount)>=s.total),
       CASE WHEN s.status IN ('cancelled','refunded') THEN 'reversed' ELSE 'posted' END,s.seller_user_id
FROM sales s
ON CONFLICT (business_id,source_type,source_id,entry_type) WHERE source_id IS NOT NULL DO NOTHING;

INSERT INTO financial_ledger(id,business_id,entry_type,source_type,source_id,category_id,chart_account_id,description,amount,competence_date,cash_date,status)
SELECT gen_random_uuid(),p.business_id,'expense','payable',p.id,p.category_id,fc.chart_account_id,p.description,p.amount,p.due_date,CASE WHEN p.status='paid' THEN p.paid_at::date END,'posted'
FROM payables p LEFT JOIN financial_categories fc ON fc.id=p.category_id AND fc.business_id=p.business_id
ON CONFLICT (business_id,source_type,source_id,entry_type) WHERE source_id IS NOT NULL DO NOTHING;

INSERT INTO financial_ledger(id,business_id,entry_type,source_type,source_id,category_id,chart_account_id,description,amount,competence_date,cash_date,status)
SELECT gen_random_uuid(),r.business_id,'income','receivable',r.id,r.category_id,fc.chart_account_id,r.description,r.amount,r.due_date,CASE WHEN r.status='received' THEN r.received_at::date END,'posted'
FROM receivables r LEFT JOIN financial_categories fc ON fc.id=r.category_id AND fc.business_id=r.business_id
ON CONFLICT (business_id,source_type,source_id,entry_type) WHERE source_id IS NOT NULL DO NOTHING;
