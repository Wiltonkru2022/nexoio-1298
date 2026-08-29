CREATE OR REPLACE FUNCTION close_order_transactional(p_business_id uuid,p_order_id uuid,p_actor_user_id uuid)
RETURNS TABLE(order_id uuid,sale_id uuid,total numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_sale_id uuid := gen_random_uuid();
  v_paid numeric(14,2);
  v_location_id uuid;
  v_item record;
  v_balance record;
  v_cash_session_id uuid;
BEGIN
  SELECT * INTO v_order FROM orders
   WHERE id=p_order_id AND business_id=p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status IN ('closed','cancelled') THEN RAISE EXCEPTION 'ORDER_ALREADY_FINAL'; END IF;

  SELECT coalesce(sum(amount) FILTER (WHERE status='paid'),0) INTO v_paid
    FROM order_payments WHERE business_id=p_business_id AND order_id=p_order_id;
  IF v_paid < v_order.total THEN RAISE EXCEPTION 'PAYMENT_PENDING'; END IF;

  -- Lock and validate controlled stock before mutating anything.
  FOR v_item IN
    SELECT oi.product_id,oi.variant_id,sum(oi.quantity) quantity
      FROM order_items oi JOIN products p ON p.id=oi.product_id AND p.business_id=oi.business_id
     WHERE oi.business_id=p_business_id AND oi.order_id=p_order_id AND p.stock_control_enabled=true AND oi.status<>'cancelled'
     GROUP BY oi.product_id,oi.variant_id
  LOOP
    SELECT il.id INTO v_location_id FROM inventory_locations il
     WHERE il.business_id=p_business_id AND il.active=true AND (v_order.unit_id IS NULL OR il.unit_id=v_order.unit_id OR il.unit_id IS NULL)
     ORDER BY CASE WHEN il.unit_id=v_order.unit_id THEN 0 ELSE 1 END,il.created_at LIMIT 1;
    IF v_location_id IS NULL THEN RAISE EXCEPTION 'INVENTORY_LOCATION_REQUIRED'; END IF;

    SELECT ib.on_hand,ib.reserved INTO v_balance FROM inventory_balances ib
     WHERE ib.business_id=p_business_id AND ib.location_id=v_location_id AND ib.product_id=v_item.product_id
       AND ib.variant_id IS NOT DISTINCT FROM v_item.variant_id AND ib.lot_id IS NULL
     FOR UPDATE;
    IF NOT FOUND OR (v_balance.on_hand-v_balance.reserved) < v_item.quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK';
    END IF;
  END LOOP;

  INSERT INTO sales(id,business_id,unit_id,customer_id,seller_user_id,status,subtotal,discount,total,notes,created_at,completed_at)
  VALUES(v_sale_id,p_business_id,v_order.unit_id,v_order.customer_id,p_actor_user_id,'completed',v_order.subtotal,v_order.discount,v_order.total,v_order.notes,now(),now());

  INSERT INTO sale_items(id,business_id,sale_id,item_type,product_id,service_id,description,quantity,unit_price,discount,total)
  SELECT gen_random_uuid(),business_id,v_sale_id,
         CASE WHEN product_id IS NOT NULL THEN 'product' WHEN service_id IS NOT NULL THEN 'service' ELSE 'custom' END,
         product_id,service_id,description,quantity,unit_price,discount,total
    FROM order_items WHERE business_id=p_business_id AND order_id=p_order_id AND status<>'cancelled';

  INSERT INTO sale_payments(id,business_id,sale_id,method,amount,status,provider,external_reference,paid_at,created_at)
  SELECT gen_random_uuid(),business_id,v_sale_id,method,amount,status,provider,external_reference,paid_at,created_at
    FROM order_payments WHERE business_id=p_business_id AND order_id=p_order_id AND status='paid';

  FOR v_item IN
    SELECT oi.product_id,oi.variant_id,sum(oi.quantity) quantity
      FROM order_items oi JOIN products p ON p.id=oi.product_id AND p.business_id=oi.business_id
     WHERE oi.business_id=p_business_id AND oi.order_id=p_order_id AND p.stock_control_enabled=true AND oi.status<>'cancelled'
     GROUP BY oi.product_id,oi.variant_id
  LOOP
    SELECT il.id INTO v_location_id FROM inventory_locations il
     WHERE il.business_id=p_business_id AND il.active=true AND (v_order.unit_id IS NULL OR il.unit_id=v_order.unit_id OR il.unit_id IS NULL)
     ORDER BY CASE WHEN il.unit_id=v_order.unit_id THEN 0 ELSE 1 END,il.created_at LIMIT 1;
    UPDATE inventory_balances SET on_hand=on_hand-v_item.quantity,updated_at=now()
     WHERE business_id=p_business_id AND location_id=v_location_id AND product_id=v_item.product_id
       AND variant_id IS NOT DISTINCT FROM v_item.variant_id AND lot_id IS NULL;
    INSERT INTO inventory_movements(id,business_id,unit_id,product_id,movement_type,quantity,reference_type,reference_id,created_by,created_at,location_id,variant_id,notes)
    VALUES(gen_random_uuid(),p_business_id,v_order.unit_id,v_item.product_id,'sale',-v_item.quantity,'sale',v_sale_id,p_actor_user_id,now(),v_location_id,v_item.variant_id,'Baixa automática no fechamento do pedido');
  END LOOP;

  SELECT cs.id INTO v_cash_session_id FROM cash_sessions cs
   WHERE cs.business_id=p_business_id AND cs.opened_by=p_actor_user_id AND cs.status='open'
   ORDER BY cs.opened_at DESC LIMIT 1 FOR UPDATE;
  IF v_cash_session_id IS NOT NULL THEN
    INSERT INTO cash_movements(id,business_id,cash_session_id,movement_type,amount,reference_type,reference_id,description,created_by,created_at)
    SELECT gen_random_uuid(),p_business_id,v_cash_session_id,'sale',sum(op.amount),'sale',v_sale_id,'Recebimento em dinheiro do pedido',p_actor_user_id,now()
      FROM order_payments op WHERE op.business_id=p_business_id AND op.order_id=p_order_id AND op.status='paid' AND lower(op.method) IN ('cash','dinheiro')
      HAVING sum(op.amount)>0;
  END IF;

  UPDATE orders SET status='closed',fulfillment_status='completed',payment_status='paid',closed_by=p_actor_user_id,closed_at=now(),updated_at=now()
   WHERE id=p_order_id AND business_id=p_business_id;
  IF v_order.table_id IS NOT NULL THEN
    UPDATE restaurant_tables SET status='available' WHERE id=v_order.table_id AND business_id=p_business_id;
  END IF;

  INSERT INTO audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,request_id,before_json,after_json,created_at)
  VALUES(gen_random_uuid(),p_business_id,p_actor_user_id,'order.closed.transactional','order',p_order_id,null,
         jsonb_build_object('status',v_order.status,'total',v_order.total),jsonb_build_object('status','closed','saleId',v_sale_id),now());

  RETURN QUERY SELECT p_order_id,v_sale_id,v_order.total;
END;
$$;
