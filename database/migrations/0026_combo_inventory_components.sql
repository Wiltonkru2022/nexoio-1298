CREATE TABLE IF NOT EXISTS order_item_components (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  variant_id uuid REFERENCES product_variants(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_item_components_item_idx ON order_item_components(business_id,order_item_id);

CREATE OR REPLACE FUNCTION nexoio_consume_combo_components_on_close()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_component record;
  v_location_id uuid;
  v_balance record;
  v_sale_id uuid;
BEGIN
  IF NEW.action <> 'order.closed.transactional' OR NEW.entity_type <> 'order' OR NEW.entity_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.after_json->>'saleId','')='' THEN RETURN NEW; END IF;
  v_sale_id := (NEW.after_json->>'saleId')::uuid;
  SELECT * INTO v_order FROM orders WHERE id=NEW.entity_id AND business_id=NEW.business_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  FOR v_component IN
    SELECT c.product_id,c.variant_id,sum(c.quantity) quantity
      FROM order_item_components c
      JOIN order_items oi ON oi.id=c.order_item_id AND oi.business_id=c.business_id
      JOIN products p ON p.id=c.product_id AND p.business_id=c.business_id
     WHERE c.business_id=NEW.business_id AND oi.order_id=NEW.entity_id AND oi.status<>'cancelled' AND p.stock_control_enabled=true
     GROUP BY c.product_id,c.variant_id
  LOOP
    SELECT il.id INTO v_location_id FROM inventory_locations il
      WHERE il.business_id=NEW.business_id AND il.active=true AND (v_order.unit_id IS NULL OR il.unit_id=v_order.unit_id OR il.unit_id IS NULL)
      ORDER BY CASE WHEN il.unit_id=v_order.unit_id THEN 0 ELSE 1 END,il.created_at LIMIT 1;
    IF v_location_id IS NULL THEN RAISE EXCEPTION 'INVENTORY_LOCATION_REQUIRED'; END IF;
    SELECT ib.on_hand,ib.reserved INTO v_balance FROM inventory_balances ib
      WHERE ib.business_id=NEW.business_id AND ib.location_id=v_location_id AND ib.product_id=v_component.product_id
        AND ib.variant_id IS NOT DISTINCT FROM v_component.variant_id AND ib.lot_id IS NULL FOR UPDATE;
    IF NOT FOUND OR (v_balance.on_hand-v_balance.reserved)<v_component.quantity THEN RAISE EXCEPTION 'INSUFFICIENT_COMBO_STOCK'; END IF;
    UPDATE inventory_balances SET on_hand=on_hand-v_component.quantity,updated_at=now()
      WHERE business_id=NEW.business_id AND location_id=v_location_id AND product_id=v_component.product_id
        AND variant_id IS NOT DISTINCT FROM v_component.variant_id AND lot_id IS NULL;
    INSERT INTO inventory_movements(id,business_id,unit_id,product_id,movement_type,quantity,reference_type,reference_id,created_by,created_at,location_id,variant_id,notes)
    VALUES(gen_random_uuid(),NEW.business_id,v_order.unit_id,v_component.product_id,'sale',-v_component.quantity,'sale',v_sale_id,NEW.actor_user_id,now(),v_location_id,v_component.variant_id,'Baixa de componente de combo');
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS consume_combo_components_on_close ON audit_logs;
CREATE TRIGGER consume_combo_components_on_close AFTER INSERT ON audit_logs
FOR EACH ROW EXECUTE FUNCTION nexoio_consume_combo_components_on_close();
