CREATE TABLE IF NOT EXISTS restaurant_tables (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code text NOT NULL,
  capacity integer NOT NULL DEFAULT 4,
  area text,
  status text NOT NULL DEFAULT 'free',
  current_tab_id uuid,
  occupied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_tables_status_chk CHECK (status IN ('free','occupied','closing')),
  CONSTRAINT restaurant_tables_business_code_uq UNIQUE (business_id, code)
);
CREATE INDEX IF NOT EXISTS restaurant_tables_business_idx ON restaurant_tables(business_id, code);

CREATE TABLE IF NOT EXISTS restaurant_tabs (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code text NOT NULL,
  table_id uuid REFERENCES restaurant_tables(id),
  customer_id uuid REFERENCES customers(id),
  channel text NOT NULL DEFAULT 'table',
  fulfillment_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  sale_id uuid REFERENCES sales(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  requested_closure_at timestamptz,
  closed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_tabs_status_chk CHECK (status IN ('active','awaiting_closure','payment_processing','paid','closed','cancelled')),
  CONSTRAINT restaurant_tabs_channel_chk CHECK (channel IN ('table','counter','pickup','delivery')),
  CONSTRAINT restaurant_tabs_business_code_uq UNIQUE (business_id, code)
);
ALTER TABLE restaurant_tables DROP CONSTRAINT IF EXISTS restaurant_tables_current_tab_fk;
ALTER TABLE restaurant_tables ADD CONSTRAINT restaurant_tables_current_tab_fk FOREIGN KEY (current_tab_id) REFERENCES restaurant_tabs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS restaurant_tabs_business_status_idx ON restaurant_tabs(business_id,status);
CREATE INDEX IF NOT EXISTS restaurant_tabs_table_idx ON restaurant_tabs(business_id,table_id);

CREATE TABLE IF NOT EXISTS restaurant_orders (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tab_id uuid NOT NULL REFERENCES restaurant_tabs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_orders_status_chk CHECK (status IN ('open','sent','preparing','ready','served','cancelled'))
);
CREATE INDEX IF NOT EXISTS restaurant_orders_tab_idx ON restaurant_orders(business_id,tab_id,created_at);

CREATE TABLE IF NOT EXISTS restaurant_order_items (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES restaurant_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  total numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_order_items_order_idx ON restaurant_order_items(business_id,order_id);

CREATE TABLE IF NOT EXISTS kitchen_tickets (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES restaurant_orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ready_at timestamptz,
  CONSTRAINT kitchen_tickets_status_chk CHECK (status IN ('queued','preparing','ready','served','cancelled'))
);
CREATE INDEX IF NOT EXISTS kitchen_tickets_business_status_idx ON kitchen_tickets(business_id,status);

CREATE TABLE IF NOT EXISTS restaurant_payments (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tab_id uuid NOT NULL REFERENCES restaurant_tabs(id) ON DELETE CASCADE,
  method text NOT NULL,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  external_reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_payments_status_chk CHECK (status IN ('pending','confirmed','failed','refunded'))
);
CREATE INDEX IF NOT EXISTS restaurant_payments_tab_idx ON restaurant_payments(business_id,tab_id);
