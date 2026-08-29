-- Service-order parts must move physical stock atomically with the OS line.
CREATE OR REPLACE FUNCTION add_service_order_part_transactional(
  p_business_id uuid,
  p_actor_user_id uuid,
  p_service_order_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_description text,
  p_quantity numeric,
  p_unit_cost numeric,
  p_unit_price numeric
)
RETURNS TABLE(part_id uuid,total numeric,stock_moved boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_part_id uuid := gen_random_uuid();
  v_product products%ROWTYPE;
  v_location_id uuid := p_location_id;
  v_needed numeric(14,3) := p_quantity;
  v_take numeric(14,3);
  v_balance record;
  v_total numeric(14,2);
  v_unit_cost numeric(14,2) := p_unit_cost;
  v_movement_id uuid;
BEGIN
  IF p_quantity <= 0 OR p_unit_price < 0 THEN RAISE EXCEPTION 'INVALID_SERVICE_ORDER_PART'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM service_orders
    WHERE id=p_service_order_id AND business_id=p_business_id AND status NOT IN ('cancelled','delivered')
  ) THEN RAISE EXCEPTION 'SERVICE_ORDER_NOT_OPEN'; END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT * INTO v_product FROM products WHERE id=p_product_id AND business_id=p_business_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
    IF v_unit_cost IS NULL THEN v_unit_cost := v_product.cost_price; END IF;

    IF v_product.stock_control_enabled THEN
      IF v_location_id IS NULL THEN
        SELECT il.id INTO v_location_id
        FROM inventory_locations il
        WHERE il.business_id=p_business_id AND il.active=true
        ORDER BY il.created_at,il.id LIMIT 1;
      END IF;
      IF v_location_id IS NULL THEN RAISE EXCEPTION 'INVENTORY_LOCATION_REQUIRED'; END IF;
      IF NOT EXISTS(SELECT 1 FROM inventory_locations WHERE id=v_location_id AND business_id=p_business_id AND active=true) THEN
        RAISE EXCEPTION 'INVENTORY_LOCATION_NOT_FOUND';
      END IF;

      FOR v_balance IN
        SELECT ib.location_id,ib.product_id,ib.variant_id,ib.lot_id,ib.on_hand,ib.reserved,l.expiration_date,ib.updated_at
        FROM inventory_balances ib
        LEFT JOIN inventory_lots l ON l.id=ib.lot_id AND l.business_id=ib.business_id
        WHERE ib.business_id=p_business_id AND ib.location_id=v_location_id AND ib.product_id=p_product_id
          AND ib.variant_id IS NULL AND (ib.on_hand-ib.reserved)>0
          AND (l.expiration_date IS NULL OR l.expiration_date>=current_date)
        ORDER BY l.expiration_date NULLS LAST,ib.updated_at,ib.lot_id NULLS LAST
        FOR UPDATE OF ib
      LOOP
        EXIT WHEN v_needed<=0;
        v_take:=least(v_needed,v_balance.on_hand-v_balance.reserved);
        IF v_take<=0 THEN CONTINUE; END IF;
        UPDATE inventory_balances SET on_hand=on_hand-v_take,updated_at=now()
        WHERE business_id=p_business_id AND location_id=v_location_id AND product_id=p_product_id
          AND variant_id IS NULL AND lot_id IS NOT DISTINCT FROM v_balance.lot_id;
        v_movement_id:=gen_random_uuid();
        INSERT INTO inventory_movements(id,business_id,product_id,movement_type,quantity,reference_type,reference_id,created_by,location_id,variant_id,lot_id,unit_cost,notes)
        VALUES(v_movement_id,p_business_id,p_product_id,'sale',-v_take,'service_order',p_service_order_id,p_actor_user_id,v_location_id,NULL,v_balance.lot_id,v_unit_cost,'Peça aplicada em ordem de serviço');
        v_needed:=v_needed-v_take;
      END LOOP;
      IF v_needed>0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;

      UPDATE inventory_cost_state
      SET quantity_on_hand=greatest(0,quantity_on_hand-p_quantity),updated_at=now()
      WHERE business_id=p_business_id AND location_id=v_location_id AND product_id=p_product_id
        AND variant_key='00000000-0000-0000-0000-000000000000'::uuid;
    END IF;
  END IF;

  v_total:=round((p_quantity*p_unit_price)::numeric,2);
  INSERT INTO service_order_parts(id,business_id,service_order_id,product_id,description,quantity,unit_cost,unit_price,total)
  VALUES(v_part_id,p_business_id,p_service_order_id,p_product_id,p_description,p_quantity,v_unit_cost,p_unit_price,v_total);

  INSERT INTO service_order_events(id,business_id,service_order_id,event_type,status,notes,actor_user_id)
  VALUES(gen_random_uuid(),p_business_id,p_service_order_id,'part_added','in_progress',p_description||' · '||p_quantity::text||' un.',p_actor_user_id);

  INSERT INTO audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,created_at)
  VALUES(gen_random_uuid(),p_business_id,p_actor_user_id,'service_order.part.added','service_order',p_service_order_id,NULL,
    jsonb_build_object('partId',v_part_id,'productId',p_product_id,'locationId',v_location_id,'quantity',p_quantity,'total',v_total),now());

  RETURN QUERY SELECT v_part_id,v_total,(p_product_id IS NOT NULL AND v_product.stock_control_enabled);
END;
$$;
