CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  document_number text,
  email text,
  phone text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id),
  location_id uuid NOT NULL REFERENCES inventory_locations(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ordered','partial','received','cancelled')),
  ordered_on date NOT NULL DEFAULT current_date,
  expected_on date,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_orders_business_status_idx ON purchase_orders(business_id,status,ordered_on DESC);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  variant_id uuid REFERENCES product_variants(id),
  description text NOT NULL,
  ordered_quantity numeric(14,3) NOT NULL CHECK (ordered_quantity > 0),
  received_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
  total numeric(14,2) NOT NULL CHECK (total >= 0)
);
CREATE INDEX IF NOT EXISTS purchase_order_items_order_idx ON purchase_order_items(business_id,purchase_order_id);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id),
  location_id uuid NOT NULL REFERENCES inventory_locations(id),
  received_by uuid REFERENCES users(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
CREATE INDEX IF NOT EXISTS goods_receipts_order_idx ON goods_receipts(business_id,purchase_order_id,received_at DESC);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  goods_receipt_id uuid NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES purchase_order_items(id),
  product_id uuid NOT NULL REFERENCES products(id),
  variant_id uuid REFERENCES product_variants(id),
  lot_id uuid REFERENCES inventory_lots(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
  expiration_date date
);

CREATE TABLE IF NOT EXISTS inventory_cost_state (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_key uuid NOT NULL,
  variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  average_cost numeric(14,4) NOT NULL DEFAULT 0,
  quantity_on_hand numeric(14,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,location_id,product_id,variant_key)
);

CREATE TABLE IF NOT EXISTS inventory_cost_layers (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id),
  lot_id uuid REFERENCES inventory_lots(id),
  source_type text NOT NULL,
  source_id uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  expiration_date date,
  unit_cost numeric(14,4) NOT NULL,
  original_quantity numeric(14,3) NOT NULL,
  remaining_quantity numeric(14,3) NOT NULL CHECK (remaining_quantity >= 0)
);
CREATE INDEX IF NOT EXISTS inventory_cost_layers_fifo_idx ON inventory_cost_layers(business_id,location_id,product_id,variant_id,received_at,id) WHERE remaining_quantity > 0;
CREATE INDEX IF NOT EXISTS inventory_cost_layers_fefo_idx ON inventory_cost_layers(business_id,location_id,product_id,variant_id,expiration_date,received_at,id) WHERE remaining_quantity > 0;

CREATE OR REPLACE FUNCTION receive_purchase_order_transactional(
  p_business_id uuid,
  p_purchase_order_id uuid,
  p_actor_user_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_order purchase_orders%ROWTYPE;
  v_receipt_id uuid := gen_random_uuid();
  v_item jsonb;
  v_po_item purchase_order_items%ROWTYPE;
  v_qty numeric(14,3);
  v_unit_cost numeric(14,4);
  v_lot_id uuid;
  v_lot_code text;
  v_expiration date;
  v_prev_qty numeric(14,3);
  v_prev_avg numeric(14,4);
  v_new_qty numeric(14,3);
  v_new_avg numeric(14,4);
  v_variant_key uuid;
BEGIN
  SELECT * INTO v_order FROM purchase_orders
   WHERE id=p_purchase_order_id AND business_id=p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_ORDER_NOT_FOUND'; END IF;
  IF v_order.status IN ('received','cancelled') THEN RAISE EXCEPTION 'PURCHASE_ORDER_NOT_RECEIVABLE'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'RECEIPT_ITEMS_REQUIRED'; END IF;

  INSERT INTO goods_receipts(id,business_id,purchase_order_id,location_id,received_by,notes)
  VALUES(v_receipt_id,p_business_id,p_purchase_order_id,v_order.location_id,p_actor_user_id,p_notes);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_po_item FROM purchase_order_items
     WHERE id=(v_item->>'purchaseOrderItemId')::uuid
       AND purchase_order_id=p_purchase_order_id AND business_id=p_business_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_ORDER_ITEM_NOT_FOUND'; END IF;
    v_qty := (v_item->>'quantity')::numeric;
    IF v_qty <= 0 OR v_po_item.received_quantity + v_qty > v_po_item.ordered_quantity THEN RAISE EXCEPTION 'INVALID_RECEIPT_QUANTITY'; END IF;
    v_unit_cost := COALESCE(NULLIF(v_item->>'unitCost','')::numeric,v_po_item.unit_cost);
    v_lot_code := NULLIF(v_item->>'lotCode','');
    v_expiration := NULLIF(v_item->>'expirationDate','')::date;
    v_lot_id := NULL;

    IF v_lot_code IS NOT NULL THEN
      INSERT INTO inventory_lots(id,business_id,product_id,variant_id,lot_code,expiration_date,unit_cost)
      VALUES(gen_random_uuid(),p_business_id,v_po_item.product_id,v_po_item.variant_id,v_lot_code,v_expiration,v_unit_cost)
      ON CONFLICT (business_id,product_id,lot_code) DO UPDATE SET expiration_date=COALESCE(EXCLUDED.expiration_date,inventory_lots.expiration_date),unit_cost=EXCLUDED.unit_cost
      RETURNING id INTO v_lot_id;
    END IF;

    INSERT INTO goods_receipt_items(id,business_id,goods_receipt_id,purchase_order_item_id,product_id,variant_id,lot_id,quantity,unit_cost,expiration_date)
    VALUES(gen_random_uuid(),p_business_id,v_receipt_id,v_po_item.id,v_po_item.product_id,v_po_item.variant_id,v_lot_id,v_qty,v_unit_cost,v_expiration);

    INSERT INTO inventory_balances(business_id,location_id,product_id,variant_id,lot_id,on_hand,reserved,updated_at)
    VALUES(p_business_id,v_order.location_id,v_po_item.product_id,v_po_item.variant_id,v_lot_id,v_qty,0,now())
    ON CONFLICT (business_id,location_id,product_id,variant_id,lot_id)
    DO UPDATE SET on_hand=inventory_balances.on_hand+EXCLUDED.on_hand,updated_at=now();

    INSERT INTO inventory_movements(id,business_id,product_id,movement_type,quantity,reference_type,reference_id,created_by,location_id,variant_id,lot_id,unit_cost,notes)
    VALUES(gen_random_uuid(),p_business_id,v_po_item.product_id,'purchase_receipt',v_qty,'goods_receipt',v_receipt_id,p_actor_user_id,v_order.location_id,v_po_item.variant_id,v_lot_id,v_unit_cost,'Entrada por recebimento de compra');

    v_variant_key := COALESCE(v_po_item.variant_id,'00000000-0000-0000-0000-000000000000'::uuid);
    SELECT quantity_on_hand,average_cost INTO v_prev_qty,v_prev_avg FROM inventory_cost_state
     WHERE business_id=p_business_id AND location_id=v_order.location_id AND product_id=v_po_item.product_id AND variant_key=v_variant_key
     FOR UPDATE;
    v_prev_qty := COALESCE(v_prev_qty,0); v_prev_avg := COALESCE(v_prev_avg,0);
    v_new_qty := v_prev_qty + v_qty;
    v_new_avg := CASE WHEN v_new_qty=0 THEN 0 ELSE ((v_prev_qty*v_prev_avg)+(v_qty*v_unit_cost))/v_new_qty END;
    INSERT INTO inventory_cost_state(business_id,location_id,product_id,variant_key,variant_id,average_cost,quantity_on_hand,updated_at)
    VALUES(p_business_id,v_order.location_id,v_po_item.product_id,v_variant_key,v_po_item.variant_id,v_new_avg,v_new_qty,now())
    ON CONFLICT (business_id,location_id,product_id,variant_key)
    DO UPDATE SET average_cost=EXCLUDED.average_cost,quantity_on_hand=EXCLUDED.quantity_on_hand,updated_at=now();

    INSERT INTO inventory_cost_layers(id,business_id,location_id,product_id,variant_id,lot_id,source_type,source_id,expiration_date,unit_cost,original_quantity,remaining_quantity)
    VALUES(gen_random_uuid(),p_business_id,v_order.location_id,v_po_item.product_id,v_po_item.variant_id,v_lot_id,'goods_receipt',v_receipt_id,v_expiration,v_unit_cost,v_qty,v_qty);

    UPDATE purchase_order_items SET received_quantity=received_quantity+v_qty WHERE id=v_po_item.id;
  END LOOP;

  UPDATE purchase_orders po SET status=CASE
    WHEN NOT EXISTS (SELECT 1 FROM purchase_order_items i WHERE i.purchase_order_id=po.id AND i.received_quantity < i.ordered_quantity) THEN 'received'
    ELSE 'partial' END, updated_at=now()
  WHERE po.id=p_purchase_order_id AND po.business_id=p_business_id;

  INSERT INTO audit_logs(id,business_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,created_at)
  VALUES(gen_random_uuid(),p_business_id,p_actor_user_id,'inventory.purchase.received','purchase_order',p_purchase_order_id,
    jsonb_build_object('status',v_order.status),jsonb_build_object('receiptId',v_receipt_id),now());
  RETURN v_receipt_id;
END;
$$;
