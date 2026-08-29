-- Restaurant production foundation: reconcile historical table-only orders into an open command
-- and introduce station-based production/printing routing.

CREATE TABLE IF NOT EXISTS restaurant_production_stations (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES business_units(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  station_type text NOT NULL DEFAULT 'kitchen' CHECK (station_type IN ('kitchen','bar','fryer','grill','dessert','assembly','other')),
  printer_key text,
  auto_print boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_production_station_code_uidx
  ON restaurant_production_stations(business_id,coalesce(unit_id,'00000000-0000-0000-0000-000000000000'::uuid),code);
CREATE INDEX IF NOT EXISTS restaurant_production_station_business_idx
  ON restaurant_production_stations(business_id,active,sort_order,name);

CREATE TABLE IF NOT EXISTS restaurant_product_station_routes (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES restaurant_production_stations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,product_id,station_id)
);
CREATE INDEX IF NOT EXISTS restaurant_product_station_product_idx
  ON restaurant_product_station_routes(business_id,product_id);

CREATE TABLE IF NOT EXISTS kitchen_ticket_items (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kitchen_ticket_id uuid NOT NULL REFERENCES kitchen_tickets(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kitchen_ticket_id,order_item_id)
);
CREATE INDEX IF NOT EXISTS kitchen_ticket_items_ticket_idx
  ON kitchen_ticket_items(business_id,kitchen_ticket_id);

ALTER TABLE kitchen_tickets ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES restaurant_production_stations(id);
CREATE INDEX IF NOT EXISTS kitchen_tickets_station_idx ON kitchen_tickets(business_id,station_id,status,queued_at);

ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES restaurant_production_stations(id);
CREATE INDEX IF NOT EXISTS print_jobs_station_idx ON print_jobs(business_id,station_id,status,created_at);

-- Prevent future orphan orders when the restaurant is configured to work with commands.
CREATE OR REPLACE FUNCTION attach_restaurant_order_to_open_tab()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_mode text;
  v_tab_id uuid;
BEGIN
  IF NEW.table_id IS NULL OR NEW.tab_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT coalesce(rs.command_mode,'automatic') INTO v_mode
    FROM restaurant_settings rs WHERE rs.business_id=NEW.business_id LIMIT 1;
  v_mode := coalesce(v_mode,'automatic');
  IF v_mode='table_only' THEN RETURN NEW; END IF;
  SELECT t.id INTO v_tab_id
    FROM order_tabs t
    WHERE t.business_id=NEW.business_id AND t.table_id=NEW.table_id AND t.status='open'
    ORDER BY t.opened_at DESC LIMIT 1;
  IF v_tab_id IS NOT NULL THEN NEW.tab_id:=v_tab_id; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_attach_open_restaurant_tab ON orders;
CREATE TRIGGER orders_attach_open_restaurant_tab
BEFORE INSERT OR UPDATE OF table_id,tab_id ON orders
FOR EACH ROW EXECUTE FUNCTION attach_restaurant_order_to_open_tab();

-- Repair currently open orphan orders on businesses that do not use table-only mode.
WITH latest_tabs AS (
  SELECT DISTINCT ON (t.business_id,t.table_id) t.business_id,t.table_id,t.id tab_id
  FROM order_tabs t
  LEFT JOIN restaurant_settings rs ON rs.business_id=t.business_id
  WHERE t.status='open' AND coalesce(rs.command_mode,'automatic')<>'table_only'
  ORDER BY t.business_id,t.table_id,t.opened_at DESC
)
UPDATE orders o SET tab_id=lt.tab_id,updated_at=now()
FROM latest_tabs lt
WHERE o.business_id=lt.business_id AND o.table_id=lt.table_id AND o.tab_id IS NULL
  AND o.status NOT IN ('closed','cancelled');
