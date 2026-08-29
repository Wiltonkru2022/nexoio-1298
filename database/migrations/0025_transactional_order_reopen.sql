ALTER TABLE orders ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES sales(id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_sale_id_uidx ON orders(sale_id) WHERE sale_id IS NOT NULL;

CREATE OR REPLACE FUNCTION nexoio_link_order_sale_from_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action='order.closed.transactional' AND NEW.entity_type='order' AND NEW.entity_id IS NOT NULL
     AND COALESCE(NEW.after_json->>'saleId','') <> '' THEN
    UPDATE orders SET sale_id=(NEW.after_json->>'saleId')::uuid
      WHERE id=NEW.entity_id AND business_id=NEW.business_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS link_order_sale_from_audit ON audit_logs;
CREATE TRIGGER link_order_sale_from_audit AFTER INSERT ON audit_logs
FOR EACH ROW EXECUTE FUNCTION nexoio_link_order_sale_from_audit();

CREATE OR REPLACE FUNCTION reopen_order_transactional(
  p_business_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_sale sales%ROWTYPE;
  v_move record;
  v_payment record;
  v_reversal_id uuid;
BEGIN
  IF length(trim(COALESCE(p_reason,''))) < 3 THEN RAISE EXCEPTION 'REOPEN_REASON_REQUIRED'; END IF;
  SELECT * INTO v_order FROM orders WHERE id=p_order_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'closed' THEN RAISE EXCEPTION 'ORDER_NOT_CLOSED'; END IF;
  IF v_order.sale_id IS NULL THEN RAISE EXCEPTION 'ORDER_SALE_LINK_REQUIRED'; END IF;
  SELECT * INTO v_sale FROM sales WHERE id=v_order.sale_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND OR v_sale.status <> 'completed' THEN RAISE EXCEPTION 'SALE_NOT_REVERSIBLE'; END IF;

  IF EXISTS (
    SELECT 1 FROM sale_payments sp
      WHERE sp.business_id=p_business_id AND sp.sale_id=v_sale.id AND sp.status='paid'
        AND (NULLIF(sp.provider,'') IS NOT NULL OR NULLIF(sp.external_reference,'') IS NOT NULL)
  ) THEN RAISE EXCEPTION 'EXTERNAL_REFUND_REQUIRED'; END IF;

  FOR v_move IN
    SELECT * FROM inventory_movements
      WHERE business_id=p_business_id AND reference_type='sale' AND reference_id=v_sale.id AND movement_type='sale'
      FOR UPDATE
  LOOP
    UPDATE inventory_balances SET on_hand=on_hand-v_move.quantity,updated_at=now()
      WHERE business_id=p_business_id AND location_id=v_move.location_id AND product_id=v_move.product_id
        AND variant_id IS NOT DISTINCT FROM v_move.variant_id AND lot_id IS NOT DISTINCT FROM v_move.lot_id;
    v_reversal_id:=gen_random_uuid();
    INSERT INTO inventory_movements(id,business_id,unit_id,product_id,movement_type,quantity,reference_type,reference_id,created_by,created_at,location_id,variant_id,lot_id,unit_cost,notes)
    VALUES(v_reversal_id,p_business_id,v_move.unit_id,v_move.product_id,'sale_reversal',-v_move.quantity,'order_reopen',p_order_id,p_actor_user_id,now(),v_move.location_id,v_move.variant_id,v_move.lot_id,v_move.unit_cost,'Estoque restaurado por reabertura controlada');
  END LOOP;

  FOR v_payment IN SELECT * FROM sale_payments WHERE business_id=p_business_id AND sale_id=v_sale.id AND status='paid' FOR UPDATE
  LOOP
    INSERT INTO payment_refunds(id,business_id,sale_payment_id,amount,reason,status,created_by,created_at)
    VALUES(gen_random_uuid(),p_business_id,v_payment.id,v_payment.amount,p_reason,'completed',p_actor_user_id,now());
    UPDATE sale_payments SET status='refunded' WHERE id=v_payment.id;
  END LOOP;

  INSERT INTO order_payment_refunds(id,business_id,order_payment_id,order_id,amount,reason,status,created_by)
  SELECT gen_random_uuid(),p_business_id,op.id,p_order_id,op.amount,p_reason,'completed',p_actor_user_id
    FROM order_payments op WHERE op.business_id=p_business_id AND op.order_id=p_order_id AND op.status='paid';
  UPDATE order_payments SET status='refunded' WHERE business_id=p_business_id AND order_id=p_order_id AND status='paid';
  UPDATE order_checks SET status='open',paid_amount=0 WHERE business_id=p_business_id AND order_id=p_order_id;

  INSERT INTO cash_movements(id,business_id,cash_session_id,movement_type,amount,reference_type,reference_id,description,created_by,created_at)
  SELECT gen_random_uuid(),business_id,cash_session_id,'refund',-abs(amount),'order_reopen',p_order_id,'Reversão de caixa por reabertura controlada',p_actor_user_id,now()
    FROM cash_movements WHERE business_id=p_business_id AND reference_type='sale' AND reference_id=v_sale.id AND amount<>0;

  UPDATE commissions SET status='cancelled' WHERE business_id=p_business_id AND sale_id=v_sale.id AND status<>'paid';
  IF EXISTS(SELECT 1 FROM commissions WHERE business_id=p_business_id AND sale_id=v_sale.id AND status='paid') THEN
    RAISE EXCEPTION 'PAID_COMMISSION_REVERSAL_REQUIRED';
  END IF;
  UPDATE sales SET status='cancelled',notes=concat_ws(E'\n',notes,'Revertida pela reabertura do pedido: '||p_reason) WHERE id=v_sale.id AND business_id=p_business_id;

  INSERT INTO order_reopen_events(id,business_id,order_id,reason,reopened_by,previous_status)
  VALUES(gen_random_uuid(),p_business_id,p_order_id,p_reason,p_actor_user_id,'closed');
  UPDATE orders SET status='open',sale_id=NULL,closed_at=NULL,closed_by=NULL,fulfillment_status='pending',payment_status='pending',updated_at=now()
    WHERE id=p_order_id AND business_id=p_business_id;
  IF v_order.table_id IS NOT NULL THEN UPDATE restaurant_tables SET status='occupied' WHERE id=v_order.table_id AND business_id=p_business_id; END IF;

  INSERT INTO audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,created_at)
  VALUES(gen_random_uuid(),p_business_id,p_actor_user_id,'order.reopened.transactional','order',p_order_id,
    jsonb_build_object('status','closed','saleId',v_sale.id),jsonb_build_object('status','open','reason',p_reason),now());
  RETURN p_order_id;
END;
$$;
