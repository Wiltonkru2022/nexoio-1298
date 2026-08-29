CREATE OR REPLACE FUNCTION pay_restaurant_table_transactional(
  p_business_id uuid,
  p_table_id uuid,
  p_actor_user_id uuid,
  p_method text,
  p_amount numeric
)
RETURNS TABLE(applied numeric,due_before numeric,table_released boolean)
LANGUAGE plpgsql AS $$
DECLARE
  v_table restaurant_tables%ROWTYPE;
  v_order record;
  v_paid numeric(14,2);
  v_due numeric(14,2);
  v_total_due numeric(14,2) := 0;
  v_remaining numeric(14,2) := p_amount;
  v_apply numeric(14,2);
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  SELECT * INTO v_table FROM restaurant_tables
   WHERE id=p_table_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TABLE_NOT_FOUND'; END IF;

  SELECT COALESCE(sum(GREATEST(o.total-COALESCE(p.paid,0),0)),0)
    INTO v_total_due
    FROM orders o
    LEFT JOIN (
      SELECT order_id,sum(amount) FILTER (WHERE status='paid') paid
        FROM order_payments WHERE business_id=p_business_id GROUP BY order_id
    ) p ON p.order_id=o.id
   WHERE o.business_id=p_business_id AND o.table_id=p_table_id AND o.tab_id IS NULL
     AND o.status NOT IN ('closed','cancelled');

  IF v_total_due <= 0 THEN RAISE EXCEPTION 'TABLE_HAS_NO_BALANCE'; END IF;
  IF p_amount > v_total_due + 0.001 THEN RAISE EXCEPTION 'AMOUNT_EXCEEDS_BALANCE'; END IF;

  FOR v_order IN
    SELECT o.id,o.total
      FROM orders o
     WHERE o.business_id=p_business_id AND o.table_id=p_table_id AND o.tab_id IS NULL
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
    SELECT 1 FROM orders WHERE business_id=p_business_id AND table_id=p_table_id
      AND status NOT IN ('closed','cancelled')
  ) AND NOT EXISTS (
    SELECT 1 FROM order_tabs WHERE business_id=p_business_id AND table_id=p_table_id AND status='open'
  ) THEN
    UPDATE restaurant_tables SET status='available'
     WHERE id=p_table_id AND business_id=p_business_id;
  END IF;

  RETURN QUERY SELECT p_amount-v_remaining,v_total_due,
    NOT EXISTS(SELECT 1 FROM orders WHERE business_id=p_business_id AND table_id=p_table_id AND status NOT IN ('closed','cancelled'));
END;
$$;
