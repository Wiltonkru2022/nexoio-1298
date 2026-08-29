CREATE TABLE IF NOT EXISTS restaurant_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  command_mode text NOT NULL DEFAULT 'automatic' CHECK (command_mode IN ('automatic','manual','table_only')),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Physical/manual command numbers must be reusable after a command is closed.
ALTER TABLE order_tabs DROP CONSTRAINT IF EXISTS order_tabs_business_id_code_key;
DROP INDEX IF EXISTS order_tabs_business_id_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS order_tabs_business_open_code_uidx
  ON order_tabs(business_id, code) WHERE status='open';

CREATE OR REPLACE FUNCTION reconcile_restaurant_table_and_tab()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_table_id uuid;
  v_tab_id uuid;
  v_business_id uuid;
BEGIN
  v_table_id := COALESCE(NEW.table_id, OLD.table_id);
  v_tab_id := COALESCE(NEW.tab_id, OLD.tab_id);
  v_business_id := COALESCE(NEW.business_id, OLD.business_id);

  IF v_tab_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM orders o
     WHERE o.business_id=v_business_id AND o.tab_id=v_tab_id
       AND o.status NOT IN ('closed','cancelled')
  ) THEN
    UPDATE order_tabs SET status='closed',closed_at=COALESCE(closed_at,now())
     WHERE id=v_tab_id AND business_id=v_business_id AND status='open';
  END IF;

  IF v_table_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM orders o
       WHERE o.business_id=v_business_id AND o.table_id=v_table_id
         AND o.status NOT IN ('closed','cancelled')
    ) OR EXISTS (
      SELECT 1 FROM order_tabs t
       WHERE t.business_id=v_business_id AND t.table_id=v_table_id AND t.status='open'
    ) THEN
      UPDATE restaurant_tables SET status='occupied'
       WHERE id=v_table_id AND business_id=v_business_id;
    ELSE
      UPDATE restaurant_tables SET status='available'
       WHERE id=v_table_id AND business_id=v_business_id AND status='occupied';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_reconcile_restaurant_flow ON orders;
CREATE TRIGGER orders_reconcile_restaurant_flow
AFTER INSERT OR UPDATE OF status,table_id,tab_id ON orders
FOR EACH ROW EXECUTE FUNCTION reconcile_restaurant_table_and_tab();

CREATE OR REPLACE FUNCTION pay_restaurant_tab_transactional(
  p_business_id uuid,
  p_tab_id uuid,
  p_actor_user_id uuid,
  p_method text,
  p_amount numeric
)
RETURNS TABLE(applied numeric,due_before numeric,tab_closed boolean)
LANGUAGE plpgsql AS $$
DECLARE
  v_tab order_tabs%ROWTYPE;
  v_order record;
  v_paid numeric(14,2);
  v_due numeric(14,2);
  v_total_due numeric(14,2) := 0;
  v_remaining numeric(14,2) := p_amount;
  v_apply numeric(14,2);
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  SELECT * INTO v_tab FROM order_tabs
   WHERE id=p_tab_id AND business_id=p_business_id AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TAB_NOT_FOUND'; END IF;

  SELECT COALESCE(sum(GREATEST(o.total-COALESCE(p.paid,0),0)),0)
    INTO v_total_due
    FROM orders o
    LEFT JOIN (
      SELECT order_id,sum(amount) FILTER (WHERE status='paid') paid
        FROM order_payments WHERE business_id=p_business_id GROUP BY order_id
    ) p ON p.order_id=o.id
   WHERE o.business_id=p_business_id AND o.tab_id=p_tab_id
     AND o.status NOT IN ('closed','cancelled');

  IF v_total_due <= 0 THEN RAISE EXCEPTION 'TAB_HAS_NO_BALANCE'; END IF;
  IF p_amount > v_total_due + 0.001 THEN RAISE EXCEPTION 'AMOUNT_EXCEEDS_BALANCE'; END IF;

  FOR v_order IN
    SELECT o.id,o.total
      FROM orders o
     WHERE o.business_id=p_business_id AND o.tab_id=p_tab_id
       AND o.status NOT IN ('closed','cancelled')
     ORDER BY o.created_at,o.id
     FOR UPDATE
  LOOP
    SELECT COALESCE(sum(amount) FILTER (WHERE status='paid'),0) INTO v_paid
      FROM order_payments WHERE business_id=p_business_id AND order_id=v_order.id;
    v_due := GREATEST(v_order.total-v_paid,0);
    IF v_due > 0 AND v_remaining > 0 THEN
      v_apply := LEAST(v_due,v_remaining);
      INSERT INTO order_payments(id,business_id,order_id,method,amount,status,paid_at,created_at)
      VALUES(gen_random_uuid(),p_business_id,v_order.id,p_method,v_apply,'paid',now(),now());
      v_remaining := v_remaining-v_apply;
      IF v_apply >= v_due-0.001 THEN
        UPDATE orders SET payment_status='paid',updated_at=now()
         WHERE id=v_order.id AND business_id=p_business_id;
        PERFORM close_order_transactional(p_business_id,v_order.id,p_actor_user_id);
      ELSE
        UPDATE orders SET payment_status='partial',updated_at=now()
         WHERE id=v_order.id AND business_id=p_business_id;
      END IF;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM orders WHERE business_id=p_business_id AND tab_id=p_tab_id
      AND status NOT IN ('closed','cancelled')
  ) THEN
    UPDATE order_tabs SET status='closed',closed_by=p_actor_user_id,closed_at=COALESCE(closed_at,now())
     WHERE id=p_tab_id AND business_id=p_business_id;
  END IF;

  RETURN QUERY SELECT p_amount-v_remaining,v_total_due,
    NOT EXISTS(SELECT 1 FROM order_tabs WHERE id=p_tab_id AND business_id=p_business_id AND status='open');
END;
$$;
