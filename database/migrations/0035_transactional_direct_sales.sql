CREATE OR REPLACE FUNCTION create_sale_transactional(
  p_business_id uuid,
  p_actor_user_id uuid,
  p_unit_id uuid,
  p_customer_id uuid,
  p_notes text,
  p_items jsonb,
  p_payments jsonb
)
RETURNS TABLE(sale_id uuid, subtotal numeric, discount numeric, total numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_id uuid := gen_random_uuid();
  v_item jsonb;
  v_payment jsonb;
  v_item_id uuid;
  v_product products%ROWTYPE;
  v_service services%ROWTYPE;
  v_item_type text;
  v_product_id uuid;
  v_service_id uuid;
  v_professional_id uuid;
  v_description text;
  v_qty numeric(14,3);
  v_price numeric(14,2);
  v_item_discount numeric(14,2);
  v_item_total numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_payment_total numeric(14,2) := 0;
  v_cash_total numeric(14,2) := 0;
  v_method text;
  v_amount numeric(14,2);
  v_location_id uuid;
  v_balance record;
  v_cash_session_id uuid;
  v_rule record;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'SALE_ITEMS_REQUIRED'; END IF;
  IF jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments)=0 THEN RAISE EXCEPTION 'SALE_PAYMENTS_REQUIRED'; END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=p_customer_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;

  -- First pass: validate items and calculate the authoritative total.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_item_type := coalesce(nullif(v_item->>'itemType',''),'other');
    v_product_id := nullif(v_item->>'productId','')::uuid;
    v_service_id := nullif(v_item->>'serviceId','')::uuid;
    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    v_item_discount := coalesce((v_item->>'discount')::numeric,0);
    v_description := nullif(v_item->>'description','');
    IF v_qty<=0 OR v_item_discount<0 THEN RAISE EXCEPTION 'INVALID_SALE_ITEM'; END IF;

    IF v_item_type='product' THEN
      IF v_product_id IS NULL THEN RAISE EXCEPTION 'PRODUCT_REQUIRED'; END IF;
      SELECT * INTO v_product FROM products WHERE id=v_product_id AND business_id=p_business_id AND active=true;
      IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
      v_price := v_product.sale_price;
      v_description := coalesce(v_description,v_product.name);
    ELSIF v_item_type='service' THEN
      IF v_service_id IS NULL THEN RAISE EXCEPTION 'SERVICE_REQUIRED'; END IF;
      SELECT * INTO v_service FROM services WHERE id=v_service_id AND business_id=p_business_id AND active=true;
      IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
      v_price := v_service.price;
      v_description := coalesce(v_description,v_service.name);
    ELSE
      v_price := coalesce((v_item->>'unitPrice')::numeric,-1);
      IF v_price<0 OR v_description IS NULL THEN RAISE EXCEPTION 'INVALID_CUSTOM_ITEM'; END IF;
    END IF;

    v_item_total := greatest(0,(v_qty*v_price)-v_item_discount);
    v_subtotal := v_subtotal+(v_qty*v_price);
    v_discount := v_discount+v_item_discount;
  END LOOP;
  IF v_discount>v_subtotal THEN RAISE EXCEPTION 'INVALID_DISCOUNT'; END IF;
  v_total := v_subtotal-v_discount;
  IF v_total<=0 THEN RAISE EXCEPTION 'INVALID_SALE_TOTAL'; END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    v_method := lower(trim(coalesce(v_payment->>'method','')));
    v_amount := coalesce((v_payment->>'amount')::numeric,0);
    IF v_method='' OR v_amount<=0 THEN RAISE EXCEPTION 'INVALID_PAYMENT'; END IF;
    v_payment_total := v_payment_total+v_amount;
    IF v_method IN ('cash','dinheiro') THEN v_cash_total := v_cash_total+v_amount; END IF;
  END LOOP;
  IF abs(v_payment_total-v_total)>0.01 THEN RAISE EXCEPTION 'PAYMENT_TOTAL_MISMATCH'; END IF;

  IF v_cash_total>0 THEN
    SELECT cs.id INTO v_cash_session_id FROM cash_sessions cs
      WHERE cs.business_id=p_business_id AND cs.opened_by=p_actor_user_id AND cs.status='open'
      ORDER BY cs.opened_at DESC LIMIT 1 FOR UPDATE;
    IF v_cash_session_id IS NULL THEN RAISE EXCEPTION 'OPEN_CASH_REQUIRED'; END IF;
  END IF;

  -- Lock and validate controlled inventory before inserting the sale.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_item_type := coalesce(nullif(v_item->>'itemType',''),'other');
    v_product_id := nullif(v_item->>'productId','')::uuid;
    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    IF v_item_type='product' AND v_product_id IS NOT NULL THEN
      SELECT * INTO v_product FROM products WHERE id=v_product_id AND business_id=p_business_id AND active=true;
      IF v_product.stock_control_enabled THEN
        SELECT il.id INTO v_location_id FROM inventory_locations il
          WHERE il.business_id=p_business_id AND il.active=true
            AND (p_unit_id IS NULL OR il.unit_id=p_unit_id OR il.unit_id IS NULL)
          ORDER BY CASE WHEN il.unit_id=p_unit_id THEN 0 ELSE 1 END,il.created_at LIMIT 1;
        IF v_location_id IS NULL THEN RAISE EXCEPTION 'INVENTORY_LOCATION_REQUIRED'; END IF;
        SELECT ib.on_hand,ib.reserved INTO v_balance FROM inventory_balances ib
          WHERE ib.business_id=p_business_id AND ib.location_id=v_location_id AND ib.product_id=v_product_id
            AND ib.variant_id IS NULL AND ib.lot_id IS NULL FOR UPDATE;
        IF NOT FOUND OR (v_balance.on_hand-v_balance.reserved)<v_qty THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO sales(id,business_id,unit_id,customer_id,seller_user_id,status,subtotal,discount,total,notes,created_at,completed_at)
  VALUES(v_sale_id,p_business_id,p_unit_id,p_customer_id,p_actor_user_id,'completed',v_subtotal,v_discount,v_total,p_notes,now(),now());

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := gen_random_uuid();
    v_item_type := coalesce(nullif(v_item->>'itemType',''),'other');
    v_product_id := nullif(v_item->>'productId','')::uuid;
    v_service_id := nullif(v_item->>'serviceId','')::uuid;
    v_professional_id := nullif(v_item->>'professionalId','')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_item_discount := coalesce((v_item->>'discount')::numeric,0);
    v_description := nullif(v_item->>'description','');
    IF v_item_type='product' THEN SELECT * INTO v_product FROM products WHERE id=v_product_id AND business_id=p_business_id; v_price:=v_product.sale_price; v_description:=coalesce(v_description,v_product.name);
    ELSIF v_item_type='service' THEN SELECT * INTO v_service FROM services WHERE id=v_service_id AND business_id=p_business_id; v_price:=v_service.price; v_description:=coalesce(v_description,v_service.name);
    ELSE v_price:=(v_item->>'unitPrice')::numeric; END IF;
    v_item_total := greatest(0,(v_qty*v_price)-v_item_discount);

    IF v_professional_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM professionals WHERE id=v_professional_id AND business_id=p_business_id AND active=true) THEN RAISE EXCEPTION 'PROFESSIONAL_NOT_FOUND'; END IF;
    INSERT INTO sale_items(id,business_id,sale_id,item_type,product_id,service_id,professional_id,description,quantity,unit_price,discount,total)
    VALUES(v_item_id,p_business_id,v_sale_id,v_item_type,v_product_id,v_service_id,v_professional_id,v_description,v_qty,v_price,v_item_discount,v_item_total);

    IF v_item_type='product' AND v_product.stock_control_enabled THEN
      SELECT il.id INTO v_location_id FROM inventory_locations il
        WHERE il.business_id=p_business_id AND il.active=true AND (p_unit_id IS NULL OR il.unit_id=p_unit_id OR il.unit_id IS NULL)
        ORDER BY CASE WHEN il.unit_id=p_unit_id THEN 0 ELSE 1 END,il.created_at LIMIT 1;
      UPDATE inventory_balances SET on_hand=on_hand-v_qty,updated_at=now()
        WHERE business_id=p_business_id AND location_id=v_location_id AND product_id=v_product_id AND variant_id IS NULL AND lot_id IS NULL;
      INSERT INTO inventory_movements(id,business_id,unit_id,product_id,movement_type,quantity,reference_type,reference_id,created_by,created_at,location_id,unit_cost,notes)
      VALUES(gen_random_uuid(),p_business_id,p_unit_id,v_product_id,'sale',-v_qty,'sale',v_sale_id,p_actor_user_id,now(),v_location_id,v_product.cost_price,'Baixa transacional pelo PDV');
    END IF;

    IF v_professional_id IS NOT NULL THEN
      SELECT cr.rate_percent,cr.fixed_amount INTO v_rule FROM commission_rules cr
        WHERE cr.business_id=p_business_id AND cr.active=true
          AND (cr.professional_id IS NULL OR cr.professional_id=v_professional_id)
          AND (cr.item_type='all' OR cr.item_type=v_item_type)
          AND (cr.product_id IS NULL OR cr.product_id=v_product_id)
          AND (cr.service_id IS NULL OR cr.service_id=v_service_id)
        ORDER BY (cr.professional_id IS NOT NULL)::int DESC,(cr.product_id IS NOT NULL OR cr.service_id IS NOT NULL)::int DESC LIMIT 1;
      IF FOUND AND (coalesce(v_rule.rate_percent,0)>0 OR coalesce(v_rule.fixed_amount,0)>0) THEN
        INSERT INTO commissions(id,business_id,professional_id,sale_id,sale_item_id,basis_amount,rate_percent,amount,status,due_date,created_at)
        VALUES(gen_random_uuid(),p_business_id,v_professional_id,v_sale_id,v_item_id,v_item_total,coalesce(v_rule.rate_percent,0),round((v_item_total*coalesce(v_rule.rate_percent,0)/100)+coalesce(v_rule.fixed_amount,0),2),'pending',current_date,now());
      END IF;
    END IF;
  END LOOP;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    v_method := lower(trim(v_payment->>'method'));
    v_amount := (v_payment->>'amount')::numeric;
    INSERT INTO sale_payments(id,business_id,sale_id,method,amount,status,provider,external_reference,paid_at,created_at)
    VALUES(gen_random_uuid(),p_business_id,v_sale_id,v_method,v_amount,'paid',nullif(v_payment->>'provider',''),nullif(v_payment->>'externalReference',''),now(),now());
  END LOOP;

  IF v_cash_total>0 THEN
    INSERT INTO cash_movements(id,business_id,cash_session_id,movement_type,amount,reference_type,reference_id,description,created_by,created_at)
    VALUES(gen_random_uuid(),p_business_id,v_cash_session_id,'sale',v_cash_total,'sale',v_sale_id,'Recebimento em dinheiro no PDV',p_actor_user_id,now());
  END IF;

  IF p_customer_id IS NOT NULL THEN
    UPDATE customers SET total_spent=coalesce(total_spent,0)+v_total,first_purchase_at=coalesce(first_purchase_at,now()),last_purchase_at=now(),updated_at=now()
      WHERE id=p_customer_id AND business_id=p_business_id;
  END IF;

  INSERT INTO audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,after_json,created_at)
  VALUES(gen_random_uuid(),p_business_id,p_actor_user_id,'sale.created.transactional','sale',v_sale_id,jsonb_build_object('subtotal',v_subtotal,'discount',v_discount,'total',v_total,'payments',p_payments),now());

  RETURN QUERY SELECT v_sale_id,v_subtotal,v_discount,v_total;
END;
$$;
