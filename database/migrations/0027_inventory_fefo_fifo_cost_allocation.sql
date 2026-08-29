CREATE TABLE IF NOT EXISTS inventory_cost_allocations (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  inventory_movement_id uuid NOT NULL REFERENCES inventory_movements(id) ON DELETE CASCADE,
  cost_layer_id uuid NOT NULL REFERENCES inventory_cost_layers(id),
  product_id uuid NOT NULL REFERENCES products(id),
  variant_id uuid REFERENCES product_variants(id),
  lot_id uuid REFERENCES inventory_lots(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,4) NOT NULL,
  total_cost numeric(14,4) NOT NULL,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_cost_allocations_sale_idx ON inventory_cost_allocations(business_id,sale_id,reversed_at);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_cost_allocations_movement_layer_uidx ON inventory_cost_allocations(inventory_movement_id,cost_layer_id) WHERE reversed_at IS NULL;

-- Seed cost layers for inventory that predates the costing engine.
INSERT INTO inventory_cost_layers(id,business_id,location_id,product_id,variant_id,lot_id,source_type,source_id,received_at,expiration_date,unit_cost,original_quantity,remaining_quantity)
SELECT gen_random_uuid(),ib.business_id,ib.location_id,ib.product_id,ib.variant_id,ib.lot_id,'opening_balance',NULL,
       COALESCE(l.created_at,p.created_at,now()),l.expiration_date,
       COALESCE(l.unit_cost,pv.cost_price,p.cost_price,0),ib.on_hand,ib.on_hand
FROM inventory_balances ib
JOIN products p ON p.id=ib.product_id AND p.business_id=ib.business_id
LEFT JOIN product_variants pv ON pv.id=ib.variant_id AND pv.business_id=ib.business_id
LEFT JOIN inventory_lots l ON l.id=ib.lot_id AND l.business_id=ib.business_id
WHERE ib.on_hand>0
  AND NOT EXISTS(
    SELECT 1 FROM inventory_cost_layers cl
    WHERE cl.business_id=ib.business_id AND cl.location_id=ib.location_id AND cl.product_id=ib.product_id
      AND cl.variant_id IS NOT DISTINCT FROM ib.variant_id AND cl.lot_id IS NOT DISTINCT FROM ib.lot_id
  );

INSERT INTO inventory_cost_state(business_id,location_id,product_id,variant_key,variant_id,average_cost,quantity_on_hand,updated_at)
SELECT ib.business_id,ib.location_id,ib.product_id,COALESCE(ib.variant_id,'00000000-0000-0000-0000-000000000000'::uuid),ib.variant_id,
       CASE WHEN sum(ib.on_hand)>0 THEN sum(ib.on_hand*COALESCE(l.unit_cost,pv.cost_price,p.cost_price,0))/sum(ib.on_hand) ELSE 0 END,
       sum(ib.on_hand),now()
FROM inventory_balances ib
JOIN products p ON p.id=ib.product_id AND p.business_id=ib.business_id
LEFT JOIN product_variants pv ON pv.id=ib.variant_id AND pv.business_id=ib.business_id
LEFT JOIN inventory_lots l ON l.id=ib.lot_id AND l.business_id=ib.business_id
GROUP BY ib.business_id,ib.location_id,ib.product_id,ib.variant_id
ON CONFLICT (business_id,location_id,product_id,variant_key) DO UPDATE
SET average_cost=EXCLUDED.average_cost,quantity_on_hand=EXCLUDED.quantity_on_hand,updated_at=now();

CREATE OR REPLACE FUNCTION reserve_inventory_fefo_fifo(
  p_business_id uuid,p_order_id uuid,p_location_id uuid,p_product_id uuid,p_variant_id uuid,p_quantity numeric
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_needed numeric(14,3):=p_quantity;
  v_balance record;
  v_take numeric(14,3);
BEGIN
  IF p_quantity<=0 THEN RAISE EXCEPTION 'INVALID_RESERVATION_QUANTITY'; END IF;
  FOR v_balance IN
    SELECT ib.location_id,ib.product_id,ib.variant_id,ib.lot_id,ib.on_hand,ib.reserved,l.expiration_date,ib.updated_at
    FROM inventory_balances ib
    LEFT JOIN inventory_lots l ON l.id=ib.lot_id AND l.business_id=ib.business_id
    WHERE ib.business_id=p_business_id AND ib.location_id=p_location_id AND ib.product_id=p_product_id
      AND ib.variant_id IS NOT DISTINCT FROM p_variant_id AND (ib.on_hand-ib.reserved)>0
      AND (l.expiration_date IS NULL OR l.expiration_date>=current_date)
    ORDER BY l.expiration_date NULLS LAST,ib.updated_at,ib.lot_id NULLS LAST
    FOR UPDATE OF ib
  LOOP
    EXIT WHEN v_needed<=0;
    v_take:=least(v_needed,v_balance.on_hand-v_balance.reserved);
    IF v_take<=0 THEN CONTINUE; END IF;
    UPDATE inventory_balances SET reserved=reserved+v_take,updated_at=now()
      WHERE business_id=p_business_id AND location_id=p_location_id AND product_id=p_product_id
        AND variant_id IS NOT DISTINCT FROM p_variant_id AND lot_id IS NOT DISTINCT FROM v_balance.lot_id;
    INSERT INTO inventory_reservations(id,business_id,location_id,product_id,variant_id,lot_id,quantity,reference_type,reference_id,status,created_at)
    VALUES(gen_random_uuid(),p_business_id,p_location_id,p_product_id,p_variant_id,v_balance.lot_id,v_take,'order',p_order_id,'active',now());
    v_needed:=v_needed-v_take;
  END LOOP;
  IF v_needed>0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
END;
$$;

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
    v_qty := coalesce((v_item->>'quantity')::numeric,0); v_price := coalesce((v_item->>'unitPrice')::numeric,0); v_item_discount := coalesce((v_item->>'discount')::numeric,0);
    IF v_qty<=0 OR v_price<0 OR v_item_discount<0 THEN RAISE EXCEPTION 'INVALID_ORDER_ITEM'; END IF;
    v_subtotal := v_subtotal + (v_qty*v_price); v_discount := v_discount + v_item_discount;
  END LOOP;
  IF v_discount>v_subtotal THEN RAISE EXCEPTION 'INVALID_DISCOUNT'; END IF;
  v_total := v_subtotal-v_discount;

  INSERT INTO orders(id,business_id,unit_id,customer_id,table_id,tab_id,channel,status,fulfillment_status,payment_status,subtotal,discount,total,notes,opened_by)
  VALUES(v_order_id,p_business_id,p_unit_id,p_customer_id,p_table_id,p_tab_id,coalesce(p_channel,'counter'),'open','pending','pending',v_subtotal,v_discount,v_total,p_notes,p_actor_user_id);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := gen_random_uuid(); v_qty := (v_item->>'quantity')::numeric; v_price := (v_item->>'unitPrice')::numeric;
    v_item_discount := coalesce((v_item->>'discount')::numeric,0); v_item_total := greatest(0,(v_qty*v_price)-v_item_discount);
    v_product_id := nullif(v_item->>'productId','')::uuid; v_variant_id := nullif(v_item->>'variantId','')::uuid;
    IF v_product_id IS NOT NULL THEN
      SELECT * INTO v_product FROM products WHERE id=v_product_id AND business_id=p_business_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
      IF v_product.stock_control_enabled THEN
        SELECT il.id INTO v_location_id FROM inventory_locations il
        WHERE il.business_id=p_business_id AND il.active=true AND (p_unit_id IS NULL OR il.unit_id=p_unit_id OR il.unit_id IS NULL)
        ORDER BY CASE WHEN il.unit_id=p_unit_id THEN 0 ELSE 1 END,il.created_at LIMIT 1;
        IF v_location_id IS NULL THEN RAISE EXCEPTION 'INVENTORY_LOCATION_REQUIRED'; END IF;
        PERFORM reserve_inventory_fefo_fifo(p_business_id,v_order_id,v_location_id,v_product_id,v_variant_id,v_qty);
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

CREATE OR REPLACE FUNCTION nexoio_allocate_sale_cost_layers()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_sale_id uuid;
  v_move record;
  v_layer record;
  v_needed numeric(14,3);
  v_take numeric(14,3);
  v_fallback_cost numeric(14,4);
  v_fallback_layer uuid;
  v_variant_key uuid;
BEGIN
  IF NEW.action<>'order.closed.transactional' OR NEW.entity_type<>'order' OR COALESCE(NEW.after_json->>'saleId','')='' THEN RETURN NEW; END IF;
  v_sale_id:=(NEW.after_json->>'saleId')::uuid;
  FOR v_move IN SELECT * FROM inventory_movements WHERE business_id=NEW.business_id AND reference_type='sale' AND reference_id=v_sale_id AND movement_type='sale' ORDER BY created_at,id
  LOOP
    v_needed:=abs(v_move.quantity);
    FOR v_layer IN
      SELECT * FROM inventory_cost_layers cl
      WHERE cl.business_id=NEW.business_id AND cl.location_id=v_move.location_id AND cl.product_id=v_move.product_id
        AND cl.variant_id IS NOT DISTINCT FROM v_move.variant_id
        AND (v_move.lot_id IS NULL OR cl.lot_id IS NOT DISTINCT FROM v_move.lot_id)
        AND cl.remaining_quantity>0
      ORDER BY cl.expiration_date NULLS LAST,cl.received_at,cl.id FOR UPDATE
    LOOP
      EXIT WHEN v_needed<=0;
      v_take:=least(v_needed,v_layer.remaining_quantity);
      UPDATE inventory_cost_layers SET remaining_quantity=remaining_quantity-v_take WHERE id=v_layer.id;
      INSERT INTO inventory_cost_allocations(id,business_id,sale_id,inventory_movement_id,cost_layer_id,product_id,variant_id,lot_id,quantity,unit_cost,total_cost)
      VALUES(gen_random_uuid(),NEW.business_id,v_sale_id,v_move.id,v_layer.id,v_move.product_id,v_move.variant_id,v_move.lot_id,v_take,v_layer.unit_cost,v_take*v_layer.unit_cost);
      v_needed:=v_needed-v_take;
    END LOOP;
    IF v_needed>0 THEN
      SELECT COALESCE(pv.cost_price,p.cost_price,0) INTO v_fallback_cost FROM products p LEFT JOIN product_variants pv ON pv.id=v_move.variant_id AND pv.business_id=p.business_id WHERE p.id=v_move.product_id AND p.business_id=NEW.business_id;
      v_fallback_layer:=gen_random_uuid();
      INSERT INTO inventory_cost_layers(id,business_id,location_id,product_id,variant_id,lot_id,source_type,source_id,unit_cost,original_quantity,remaining_quantity)
      VALUES(v_fallback_layer,NEW.business_id,v_move.location_id,v_move.product_id,v_move.variant_id,v_move.lot_id,'cost_recovery',v_sale_id,COALESCE(v_fallback_cost,0),v_needed,0);
      INSERT INTO inventory_cost_allocations(id,business_id,sale_id,inventory_movement_id,cost_layer_id,product_id,variant_id,lot_id,quantity,unit_cost,total_cost)
      VALUES(gen_random_uuid(),NEW.business_id,v_sale_id,v_move.id,v_fallback_layer,v_move.product_id,v_move.variant_id,v_move.lot_id,v_needed,COALESCE(v_fallback_cost,0),v_needed*COALESCE(v_fallback_cost,0));
    END IF;
    v_variant_key:=COALESCE(v_move.variant_id,'00000000-0000-0000-0000-000000000000'::uuid);
    UPDATE inventory_cost_state SET quantity_on_hand=greatest(0,quantity_on_hand-abs(v_move.quantity)),updated_at=now()
    WHERE business_id=NEW.business_id AND location_id=v_move.location_id AND product_id=v_move.product_id AND variant_key=v_variant_key;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_allocate_sale_cost_layers ON audit_logs;
CREATE TRIGGER zz_allocate_sale_cost_layers AFTER INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION nexoio_allocate_sale_cost_layers();

CREATE OR REPLACE FUNCTION nexoio_restore_sale_cost_layers()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_sale_id uuid; v_alloc record; v_variant_key uuid;
BEGIN
  IF NEW.action<>'order.reopened.transactional' OR NEW.entity_type<>'order' OR COALESCE(NEW.before_json->>'saleId','')='' THEN RETURN NEW; END IF;
  v_sale_id:=(NEW.before_json->>'saleId')::uuid;
  FOR v_alloc IN SELECT * FROM inventory_cost_allocations WHERE business_id=NEW.business_id AND sale_id=v_sale_id AND reversed_at IS NULL FOR UPDATE
  LOOP
    UPDATE inventory_cost_layers SET remaining_quantity=remaining_quantity+v_alloc.quantity WHERE id=v_alloc.cost_layer_id;
    UPDATE inventory_cost_allocations SET reversed_at=now() WHERE id=v_alloc.id;
    v_variant_key:=COALESCE(v_alloc.variant_id,'00000000-0000-0000-0000-000000000000'::uuid);
    UPDATE inventory_cost_state SET quantity_on_hand=quantity_on_hand+v_alloc.quantity,updated_at=now()
      WHERE business_id=NEW.business_id AND product_id=v_alloc.product_id AND variant_key=v_variant_key
        AND location_id=(SELECT location_id FROM inventory_cost_layers WHERE id=v_alloc.cost_layer_id);
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_restore_sale_cost_layers ON audit_logs;
CREATE TRIGGER zz_restore_sale_cost_layers AFTER INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION nexoio_restore_sale_cost_layers();
