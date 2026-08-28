CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
CREATE TABLE IF NOT EXISTS product_category_links (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE TABLE IF NOT EXISTS order_tabs (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES business_units(id),
  table_id uuid REFERENCES restaurant_tables(id),
  customer_id uuid REFERENCES customers(id),
  code text NOT NULL,
  guest_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open',
  opened_by uuid REFERENCES users(id),
  closed_by uuid REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code)
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tab_id uuid REFERENCES order_tabs(id);

CREATE TABLE IF NOT EXISTS delivery_fulfillments (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  address_json jsonb NOT NULL,
  recipient_name text,
  recipient_phone text,
  courier_name text,
  courier_user_id uuid REFERENCES users(id),
  delivery_fee numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'waiting',
  estimated_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS menu_addons (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(14,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
CREATE TABLE IF NOT EXISTS product_addon_links (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  addon_id uuid NOT NULL REFERENCES menu_addons(id) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT false,
  max_quantity integer,
  PRIMARY KEY (product_id, addon_id)
);

CREATE TABLE IF NOT EXISTS product_combos (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sale_price numeric(14,2) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS product_combo_items (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  combo_id uuid NOT NULL REFERENCES product_combos(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  required boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric(14,2) NOT NULL,
  minimum_amount numeric(14,2),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer,
  usage_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code)
);

CREATE TABLE IF NOT EXISTS delivery_zones (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  postal_code_prefix text,
  neighborhood text,
  fee numeric(14,2) NOT NULL DEFAULT 0,
  minimum_amount numeric(14,2),
  estimated_minutes integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_equipment (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  equipment_type text NOT NULL,
  brand text,
  model text,
  serial_number text,
  identifier text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_equipment_customer_idx ON customer_equipment(business_id, customer_id);
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES customer_equipment(id);

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id),
  service_order_id uuid REFERENCES service_orders(id),
  number bigint NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  valid_until date,
  approval_token_hash text,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, number)
);
CREATE TABLE IF NOT EXISTS quote_items (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  product_id uuid REFERENCES products(id),
  service_id uuid REFERENCES services(id),
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  total numeric(14,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS service_warranties (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL REFERENCES service_orders(id),
  customer_id uuid REFERENCES customers(id),
  starts_on date NOT NULL,
  expires_on date NOT NULL,
  coverage text,
  status text NOT NULL DEFAULT 'active',
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commission_rules (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES professionals(id),
  item_type text NOT NULL CHECK (item_type IN ('product','service','all')),
  product_id uuid REFERENCES products(id),
  service_id uuid REFERENCES services(id),
  rate_percent numeric(7,4) NOT NULL DEFAULT 0,
  fixed_amount numeric(14,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_hours (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES business_units(id),
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at time,
  closes_at time,
  break_starts_at time,
  break_ends_at time,
  closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, unit_id, weekday)
);

CREATE TABLE IF NOT EXISTS insurance_providers (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  rules text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
CREATE TABLE IF NOT EXISTS patient_insurances (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  insurance_provider_id uuid NOT NULL REFERENCES insurance_providers(id),
  member_number text,
  plan_name text,
  valid_until date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  audience text NOT NULL DEFAULT 'all',
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tabs_business_status_idx ON order_tabs(business_id,status,opened_at DESC);
CREATE INDEX IF NOT EXISTS delivery_business_status_idx ON delivery_fulfillments(business_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_business_status_idx ON quotes(business_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS warranties_business_status_idx ON service_warranties(business_id,status,expires_on);
CREATE INDEX IF NOT EXISTS commission_rules_business_idx ON commission_rules(business_id,professional_id,active);
