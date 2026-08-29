ALTER TABLE order_items ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES professionals(id);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES professionals(id);

CREATE OR REPLACE FUNCTION create_order_transactional(
  p_business_id uuid,
  p_actor_user_id uuid,
  p_unit_id uuid,
  p_customer_id uuid,
  p_table_id uuid,
  p_tab_id uuid,
  p_channel text,
  p_notes text,
  p_items jsonb
)
RETURNS TABLE(order_id uuid,subtotal numeric,discount numeric,total numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id uuid := gen_random_uuid();
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_item jsonb;
  v_item_id uuid;
  v_product products%ROWTYPE;
  v_location_id uuid;
  v_balance record;
  v_qty numeric(14,3);
  v_price numeric(14,2);
  v_item_discount numeric(14,2);
  v_item_total numeric(14,2);
  v_product_id uuid;
  v_variant_id uuid;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'ORDER_ITEMS_REQUIRED'; END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=p_customer_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF p_table_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM restaurant_tables WHERE id=p_table_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'TABLE_NOT_FOUND'; END IF;
  IF p_tab_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM order_tabs WHERE id=p_tab_id AND business_id=p_business_id AND status='open') THEN RAISE EXCEPTION 'TAB_NOT_FOUND'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    v_price := coalesce((v_item->>'unitPrice')::numeric,0);
    v_item_discount := coalesce((v_item->>'discount')::numeric,0);
    IF v_qty<=0 OR v_price<0 OR v_item_discount<0 THEN RAISE EXCEPTION 'INVALID_ORDER_ITEM'; END IF;
    v_subtotal := v_subtotal + (v_qty*v_price);
    v_discount := v_discount + v_item_discount;
  END LOOP;
  IF v_discount>v_subtotal THEN RAISE EXCEPTION 'INVALID_DISCOUNT'; END IF;
  v_total := v_subtotal-v_discount;

  INSERT INTO orders(id,business_id,unit_id,customer_id,table_id,tab_id,channel,status,fulfillment_status,payment_status,subtotal,discount,total,notes,opened_by)
  VALUES(v_order_id,p_business_id,p_unit_id,p_customer_id,p_table_id,p_tab_id,coalesce(p_channel,'counter'),'open','pending','pending',v_subtotal,v_discount,v_total,p_notes,p_actor_user_id);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := gen_random_uuid();
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unitPrice')::numeric;
    v_item_discount := coalesce((v_item->>'discount')::numeric,0);
    v_item_total := greatest(0,(v_qty*v_price)-v_item_discount);
    v_product_id := nullif(v_item->>'productId','')::uuid;
    v_variant_id := nullif(v_item->>'variantId','')::uuid;

    IF v_product_id IS NOT NULL THEN
      SELECT * INTO v_product FROM products WHERE id=v_product_id AND business_id=p_business_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
      IF v_product.stock_control_enabled THEN
        SELECT il.id INTO v_location_id FROM inventory_locations il
          WHERE il.business_id=p_business_id AND il.active=true AND (p_unit_id IS NULL OR il.unit_id=p_unit_id OR il.unit_id IS NULL)
          ORDER BY CASE WHEN il.unit_id=p_unit_id THEN 0 ELSE 1 END,il.created_at LIMIT 1;
        IF v_location_id IS NULL THEN RAISE EXCEPTION 'INVENTORY_LOCATION_REQUIRED'; END IF;
        SELECT ib.on_hand,ib.reserved INTO v_balance FROM inventory_balances ib
          WHERE ib.business_id=p_business_id AND ib.location_id=v_location_id AND ib.product_id=v_product_id
            AND ib.variant_id IS NOT DISTINCT FROM v_variant_id AND ib.lot_id IS NULL FOR UPDATE;
        IF NOT FOUND OR (v_balance.on_hand-v_balance.reserved)<v_qty THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
        UPDATE inventory_balances SET reserved=reserved+v_qty,updated_at=now()
          WHERE business_id=p_business_id AND location_id=v_location_id AND product_id=v_product_id
            AND variant_id IS NOT DISTINCT FROM v_variant_id AND lot_id IS NULL;
        INSERT INTO inventory_reservations(id,business_id,location_id,product_id,variant_id,lot_id,quantity,reference_type,reference_id,status,created_at)
        VALUES(gen_random_uuid(),p_business_id,v_location_id,v_product_id,v_variant_id,NULL,v_qty,'order',v_order_id,'active',now());
      END IF;
    END IF;

    INSERT INTO order_items(id,business_id,order_id,product_id,variant_id,service_id,professional_id,description,quantity,unit_price,discount,total,status,notes)
    VALUES(v_item_id,p_business_id,v_order_id,v_product_id,v_variant_id,nullif(v_item->>'serviceId','')::uuid,nullif(v_item->>'professionalId','')::uuid,
      coalesce(nullif(v_item->>'description',''),v_product.name,'Item'),v_qty,v_price,v_item_discount,v_item_total,'pending',nullif(v_item->>'notes',''));
  END LOOP;

  IF p_table_id IS NOT NULL THEN UPDATE restaurant_tables SET status='occupied' WHERE id=p_table_id AND business_id=p_business_id; END IF;
  INSERT INTO audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,created_at)
  VALUES(gen_random_uuid(),p_business_id,p_actor_user_id,'order.created.transactional','order',v_order_id,NULL,jsonb_build_object('total',v_total,'channel',p_channel),now());
  RETURN QUERY SELECT v_order_id,v_subtotal,v_discount,v_total;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_order_transactional(p_business_id uuid,p_order_id uuid,p_actor_user_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_order orders%ROWTYPE; v_res record;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id=p_order_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status IN ('closed','cancelled') THEN RAISE EXCEPTION 'ORDER_ALREADY_FINAL'; END IF;
  IF EXISTS(SELECT 1 FROM order_payments WHERE business_id=p_business_id AND order_id=p_order_id AND status='paid') THEN RAISE EXCEPTION 'PAID_ORDER_REQUIRES_REFUND'; END IF;
  FOR v_res IN SELECT * FROM inventory_reservations WHERE business_id=p_business_id AND reference_type='order' AND reference_id=p_order_id AND status='active' FOR UPDATE
  LOOP
    UPDATE inventory_balances SET reserved=greatest(0,reserved-v_res.quantity),updated_at=now()
      WHERE business_id=p_business_id AND location_id=v_res.location_id AND product_id=v_res.product_id
       AND variant_id IS NOT DISTINCT FROM v_res.variant_id AND lot_id IS NOT DISTINCT FROM v_res.lot_id;
    UPDATE inventory_reservations SET status='released' WHERE id=v_res.id;
  END LOOP;
  UPDATE orders SET status='cancelled',fulfillment_status='cancelled',notes=concat_ws(E'\n',notes,'Cancelamento: '||p_reason),closed_by=p_actor_user_id,closed_at=now(),updated_at=now()
    WHERE id=p_order_id AND business_id=p_business_id;
  IF v_order.table_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM orders WHERE business_id=p_business_id AND table_id=v_order.table_id AND id<>p_order_id AND status NOT IN ('closed','cancelled')) THEN
    UPDATE restaurant_tables SET status='available' WHERE id=v_order.table_id AND business_id=p_business_id;
  END IF;
  INSERT INTO audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,created_at)
  VALUES(gen_random_uuid(),p_business_id,p_actor_user_id,'order.cancelled','order',p_order_id,jsonb_build_object('status',v_order.status),jsonb_build_object('status','cancelled','reason',p_reason),now());
END;
$$;

CREATE OR REPLACE FUNCTION close_order_transactional(p_business_id uuid,p_order_id uuid,p_actor_user_id uuid)
RETURNS TABLE(order_id uuid,sale_id uuid,total numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order orders%ROWTYPE; v_sale_id uuid:=gen_random_uuid(); v_paid numeric(14,2); v_res record; v_item record; v_cash_session_id uuid;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id=p_order_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status IN ('closed','cancelled') THEN RAISE EXCEPTION 'ORDER_ALREADY_FINAL'; END IF;
  SELECT coalesce(sum(amount) FILTER(WHERE status='paid'),0) INTO v_paid FROM order_payments WHERE business_id=p_business_id AND order_id=p_order_id;
  IF v_paid<v_order.total THEN RAISE EXCEPTION 'PAYMENT_PENDING'; END IF;

  FOR v_res IN SELECT * FROM inventory_reservations WHERE business_id=p_business_id AND reference_type='order' AND reference_id=p_order_id AND status='active' FOR UPDATE
  LOOP
    IF NOT EXISTS(SELECT 1 FROM inventory_balances WHERE business_id=p_business_id AND location_id=v_res.location_id AND product_id=v_res.product_id AND variant_id IS NOT DISTINCT FROM v_res.variant_id AND lot_id IS NOT DISTINCT FROM v_res.lot_id AND on_hand>=v_res.quantity FOR UPDATE) THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
  END LOOP;

  -- Legacy orders without reservations are also validated and deducted safely.
  FOR v_item IN
    SELECT oi.product_id,oi.variant_id,sum(oi.quantity) quantity FROM order_items oi JOIN products p ON p.id=oi.product_id AND p.business_id=oi.business_id
    WHERE oi.business_id=p_business_id AND oi.order_id=p_order_id AND p.stock_control_enabled=true AND oi.status<>'cancelled'
      AND NOT EXISTS(SELECT 1 FROM inventory_reservations ir WHERE ir.business_id=p_business_id AND ir.reference_type='order' AND ir.reference_id=p_order_id AND ir.product_id=oi.product_id AND ir.variant_id IS NOT DISTINCT FROM oi.variant_id AND ir.status='active')
    GROUP BY oi.product_id,oi.variant_id
  LOOP
    SELECT ib.location_id,ib.on_hand,ib.reserved INTO v_res FROM inventory_balances ib WHERE ib.business_id=p_business_id AND ib.product_id=v_item.product_id AND ib.variant_id IS NOT DISTINCT FROM v_item.variant_id AND ib.lot_id IS NULL AND (ib.on_hand-ib.reserved)>=v_item.quantity ORDER BY ib.updated_at LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
    UPDATE inventory_balances SET on_hand=on_hand-v_item.quantity,updated_at=now() WHERE business_id=p_business_id AND location_id=v_res.location_id AND product_id=v_item.product_id AND variant_id IS NOT DISTINCT FROM v_item.variant_id AND lot_id IS NULL;
    INSERT INTO inventory_movements(id,business_id,unit_id,product_id,movement_type,quantity,reference_type,reference_id,created_by,location_id,variant_id,notes)
    VALUES(gen_random_uuid(),p_business_id,v_order.unit_id,v_item.product_id,'sale',-v_item.quantity,'sale',v_sale_id,p_actor_user_id,v_res.location_id,v_item.variant_id,'Baixa automática de pedido legado');
  END LOOP;

  INSERT INTO sales(id,business_id,unit_id,customer_id,seller_user_id,status,subtotal,discount,total,notes,created_at,completed_at)
  VALUES(v_sale_id,p_business_id,v_order.unit_id,v_order.customer_id,p_actor_user_id,'completed',v_order.subtotal,v_order.discount,v_order.total,v_order.notes,now(),now());
  INSERT INTO sale_items(id,business_id,sale_id,item_type,product_id,service_id,professional_id,description,quantity,unit_price,discount,total)
  SELECT gen_random_uuid(),business_id,v_sale_id,CASE WHEN product_id IS NOT NULL THEN 'product' WHEN service_id IS NOT NULL THEN 'service' ELSE 'custom' END,product_id,service_id,professional_id,description,quantity,unit_price,discount,total FROM order_items WHERE business_id=p_business_id AND order_id=p_order_id AND status<>'cancelled';
  INSERT INTO sale_payments(id,business_id,sale_id,method,amount,status,provider,external_reference,paid_at,created_at)
  SELECT gen_random_uuid(),business_id,v_sale_id,method,amount,status,provider,external_reference,paid_at,created_at FROM order_payments WHERE business_id=p_business_id AND order_id=p_order_id AND status='paid';

  FOR v_res IN SELECT * FROM inventory_reservations WHERE business_id=p_business_id AND reference_type='order' AND reference_id=p_order_id AND status='active' FOR UPDATE
  LOOP
    UPDATE inventory_balances SET on_hand=on_hand-v_res.quantity,reserved=greatest(0,reserved-v_res.quantity),updated_at=now()
      WHERE business_id=p_business_id AND location_id=v_res.location_id AND product_id=v_res.product_id AND variant_id IS NOT DISTINCT FROM v_res.variant_id AND lot_id IS NOT DISTINCT FROM v_res.lot_id;
    UPDATE inventory_reservations SET status='consumed' WHERE id=v_res.id;
    INSERT INTO inventory_movements(id,business_id,unit_id,product_id,movement_type,quantity,reference_type,reference_id,created_by,location_id,variant_id,lot_id,notes)
    VALUES(gen_random_uuid(),p_business_id,v_order.unit_id,v_res.product_id,'sale',-v_res.quantity,'sale',v_sale_id,p_actor_user_id,v_res.location_id,v_res.variant_id,v_res.lot_id,'Baixa de estoque reservada pelo pedido');
  END LOOP;

  INSERT INTO commissions(id,business_id,professional_id,sale_id,sale_item_id,basis_amount,rate_percent,amount,status,due_date,created_at)
  SELECT gen_random_uuid(),p_business_id,si.professional_id,v_sale_id,si.id,si.total,coalesce(rule.rate_percent,0),round((si.total*coalesce(rule.rate_percent,0)/100)+coalesce(rule.fixed_amount,0),2),'pending',current_date,now()
  FROM sale_items si
  JOIN LATERAL (
    SELECT cr.rate_percent,cr.fixed_amount FROM commission_rules cr
    WHERE cr.business_id=p_business_id AND cr.active=true AND (cr.professional_id IS NULL OR cr.professional_id=si.professional_id)
      AND (cr.item_type='all' OR cr.item_type=si.item_type)
      AND (cr.product_id IS NULL OR cr.product_id=si.product_id) AND (cr.service_id IS NULL OR cr.service_id=si.service_id)
    ORDER BY (cr.professional_id IS NOT NULL)::int DESC,(cr.product_id IS NOT NULL OR cr.service_id IS NOT NULL)::int DESC LIMIT 1
  ) rule ON true
  WHERE si.sale_id=v_sale_id AND si.business_id=p_business_id AND si.professional_id IS NOT NULL
    AND (coalesce(rule.rate_percent,0)>0 OR coalesce(rule.fixed_amount,0)>0);

  SELECT cs.id INTO v_cash_session_id FROM cash_sessions cs WHERE cs.business_id=p_business_id AND cs.opened_by=p_actor_user_id AND cs.status='open' ORDER BY cs.opened_at DESC LIMIT 1 FOR UPDATE;
  IF v_cash_session_id IS NOT NULL THEN
    INSERT INTO cash_movements(id,business_id,cash_session_id,movement_type,amount,reference_type,reference_id,description,created_by,created_at)
    SELECT gen_random_uuid(),p_business_id,v_cash_session_id,'sale',sum(op.amount),'sale',v_sale_id,'Recebimento em dinheiro do pedido',p_actor_user_id,now()
    FROM order_payments op WHERE op.business_id=p_business_id AND op.order_id=p_order_id AND op.status='paid' AND lower(op.method) IN ('cash','dinheiro') HAVING sum(op.amount)>0;
  END IF;
  UPDATE orders SET status='closed',fulfillment_status='completed',payment_status='paid',closed_by=p_actor_user_id,closed_at=now(),updated_at=now() WHERE id=p_order_id AND business_id=p_business_id;
  IF v_order.table_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM orders WHERE business_id=p_business_id AND table_id=v_order.table_id AND id<>p_order_id AND status NOT IN ('closed','cancelled')) THEN UPDATE restaurant_tables SET status='available' WHERE id=v_order.table_id AND business_id=p_business_id; END IF;
  INSERT INTO audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES(gen_random_uuid(),p_business_id,p_actor_user_id,'order.closed.transactional','order',p_order_id,jsonb_build_object('status',v_order.status,'total',v_order.total),jsonb_build_object('status','closed','saleId',v_sale_id),now());
  RETURN QUERY SELECT p_order_id,v_sale_id,v_order.total;
END;
$$;

CREATE OR REPLACE FUNCTION refund_sale_transactional(p_business_id uuid,p_sale_id uuid,p_actor_user_id uuid,p_reason text)
RETURNS TABLE(refunded_amount numeric,pending_provider_refunds integer)
LANGUAGE plpgsql AS $$
DECLARE v_sale sales%ROWTYPE; v_payment record; v_total numeric(14,2):=0; v_pending integer:=0; v_cash_session_id uuid;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id=p_sale_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
  IF v_sale.status='refunded' THEN RAISE EXCEPTION 'SALE_ALREADY_REFUNDED'; END IF;
  SELECT cs.id INTO v_cash_session_id FROM cash_sessions cs WHERE cs.business_id=p_business_id AND cs.opened_by=p_actor_user_id AND cs.status='open' ORDER BY opened_at DESC LIMIT 1;
  FOR v_payment IN SELECT * FROM sale_payments WHERE business_id=p_business_id AND sale_id=p_sale_id AND status='paid' FOR UPDATE
  LOOP
    IF v_payment.provider IS NULL OR lower(v_payment.method) IN ('cash','dinheiro') THEN
      INSERT INTO payment_refunds(id,business_id,sale_payment_id,amount,reason,status,created_by,created_at) VALUES(gen_random_uuid(),p_business_id,v_payment.id,v_payment.amount,p_reason,'completed',p_actor_user_id,now());
      UPDATE sale_payments SET status='refunded' WHERE id=v_payment.id;
      IF lower(v_payment.method) IN ('cash','dinheiro') THEN
        IF v_cash_session_id IS NULL THEN RAISE EXCEPTION 'OPEN_CASH_REQUIRED_FOR_CASH_REFUND'; END IF;
        INSERT INTO cash_movements(id,business_id,cash_session_id,movement_type,amount,reference_type,reference_id,description,created_by,created_at) VALUES(gen_random_uuid(),p_business_id,v_cash_session_id,'refund',v_payment.amount,'sale',p_sale_id,'Estorno em dinheiro: '||p_reason,p_actor_user_id,now());
      END IF;
    ELSE
      INSERT INTO payment_refunds(id,business_id,sale_payment_id,amount,reason,status,provider_reference,created_by,created_at) VALUES(gen_random_uuid(),p_business_id,v_payment.id,v_payment.amount,p_reason,'pending_provider',v_payment.external_reference,p_actor_user_id,now());
      v_pending:=v_pending+1;
    END IF;
    v_total:=v_total+v_payment.amount;
  END LOOP;
  UPDATE sales SET status=CASE WHEN v_pending=0 THEN 'refunded' ELSE 'refund_pending' END,cancelled_at=now(),cancelled_by=p_actor_user_id,cancellation_reason=p_reason WHERE id=p_sale_id AND business_id=p_business_id;
  UPDATE commissions SET status='cancelled' WHERE business_id=p_business_id AND sale_id=p_sale_id AND status='pending';
  INSERT INTO audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES(gen_random_uuid(),p_business_id,p_actor_user_id,'sale.refund.requested','sale',p_sale_id,jsonb_build_object('status',v_sale.status),jsonb_build_object('amount',v_total,'pendingProvider',v_pending,'reason',p_reason),now());
  RETURN QUERY SELECT v_total,v_pending;
END;
$$;
