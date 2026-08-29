CREATE OR REPLACE FUNCTION pay_standalone_order_transactional(
  p_business_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid,
  p_method text,
  p_amount numeric
)
RETURNS TABLE(order_id uuid,payment_id uuid,applied numeric,remaining numeric,status text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_paid numeric(14,2);
  v_due numeric(14,2);
  v_payment_id uuid := gen_random_uuid();
  v_remaining numeric(14,2);
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  SELECT * INTO v_order
    FROM orders
   WHERE id=p_order_id AND business_id=p_business_id
     AND table_id IS NULL AND tab_id IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status IN ('closed','cancelled') THEN RAISE EXCEPTION 'ORDER_ALREADY_FINAL'; END IF;

  SELECT coalesce(sum(amount) FILTER (WHERE status='paid'),0)
    INTO v_paid
    FROM order_payments
   WHERE business_id=p_business_id AND order_id=p_order_id;

  v_due := greatest(v_order.total-v_paid,0);
  IF v_due <= 0 THEN RAISE EXCEPTION 'ORDER_HAS_NO_BALANCE'; END IF;
  IF p_amount > v_due + 0.001 THEN RAISE EXCEPTION 'AMOUNT_EXCEEDS_BALANCE'; END IF;

  INSERT INTO order_payments(id,business_id,order_id,method,amount,status,paid_at,created_at)
  VALUES(v_payment_id,p_business_id,p_order_id,p_method,p_amount,'paid',now(),now());

  v_remaining := greatest(v_due-p_amount,0);
  IF v_remaining <= 0.001 THEN
    UPDATE orders SET payment_status='paid',updated_at=now()
     WHERE id=p_order_id AND business_id=p_business_id;
    PERFORM close_order_transactional(p_business_id,p_order_id,p_actor_user_id);
    RETURN QUERY SELECT p_order_id,v_payment_id,p_amount,0::numeric,'closed'::text;
  ELSE
    UPDATE orders SET payment_status='partial',updated_at=now()
     WHERE id=p_order_id AND business_id=p_business_id;
    RETURN QUERY SELECT p_order_id,v_payment_id,p_amount,v_remaining,'open'::text;
  END IF;
END;
$$;
