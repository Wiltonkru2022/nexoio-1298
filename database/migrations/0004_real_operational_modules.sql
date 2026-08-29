-- Nexoio operational domains: normalized entities for ERP/SaaS critical flows.
-- module_records remains available only for non-critical custom extensions.

CREATE TABLE IF NOT EXISTS financial_categories (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense','both')),
  parent_id uuid REFERENCES financial_categories(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name, kind)
);
CREATE INDEX IF NOT EXISTS financial_categories_business_idx ON financial_categories(business_id, active);

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  fee_percent numeric(7,4) NOT NULL DEFAULT 0,
  settlement_days integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code)
);

ALTER TABLE payables ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES financial_categories(id);
ALTER TABLE payables ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES payment_methods(id);
ALTER TABLE payables ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES financial_categories(id);
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS received_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES payment_methods(id);
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS payment_refunds (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_payment_id uuid REFERENCES sale_payments(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  provider_reference text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_refunds_business_idx ON payment_refunds(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS commissions (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES professionals(id),
  sale_id uuid REFERENCES sales(id),
  sale_item_id uuid REFERENCES sale_items(id),
  basis_amount numeric(14,2) NOT NULL,
  rate_percent numeric(7,4) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commissions_business_professional_idx ON commissions(business_id, professional_id, status);

CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text,
  barcode text,
  name text NOT NULL,
  attributes_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_price numeric(14,2),
  sale_price numeric(14,2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, sku)
);
CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants(business_id, product_id);

CREATE TABLE IF NOT EXISTS inventory_locations (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES business_units(id),
  name text NOT NULL,
  code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code)
);

CREATE TABLE IF NOT EXISTS inventory_lots (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  variant_id uuid REFERENCES product_variants(id),
  lot_code text NOT NULL,
  expiration_date date,
  unit_cost numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, product_id, lot_code)
);

CREATE TABLE IF NOT EXISTS inventory_balances (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES inventory_lots(id) ON DELETE CASCADE,
  on_hand numeric(14,3) NOT NULL DEFAULT 0,
  reserved numeric(14,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, location_id, product_id, variant_id, lot_id)
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES inventory_locations(id),
  product_id uuid NOT NULL REFERENCES products(id),
  variant_id uuid REFERENCES product_variants(id),
  lot_id uuid REFERENCES inventory_lots(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_reservations_ref_idx ON inventory_reservations(business_id, reference_type, reference_id, status);

ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES inventory_locations(id);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES product_variants(id);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES inventory_lots(id);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS unit_cost numeric(14,2);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES business_units(id),
  number text NOT NULL,
  seats integer,
  status text NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, unit_id, number)
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES business_units(id),
  customer_id uuid REFERENCES customers(id),
  table_id uuid REFERENCES restaurant_tables(id),
  channel text NOT NULL DEFAULT 'counter',
  status text NOT NULL DEFAULT 'draft',
  fulfillment_status text NOT NULL DEFAULT 'pending',
  payment_status text NOT NULL DEFAULT 'pending',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  delivery_fee numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  opened_by uuid REFERENCES users(id),
  closed_by uuid REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_business_status_idx ON orders(business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_table_idx ON orders(business_id, table_id, status);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  variant_id uuid REFERENCES product_variants(id),
  service_id uuid REFERENCES services(id),
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(business_id, order_id);

CREATE TABLE IF NOT EXISTS order_item_addons (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kitchen_tickets (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  station text,
  status text NOT NULL DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 0,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS kitchen_tickets_queue_idx ON kitchen_tickets(business_id, status, priority DESC, queued_at);

CREATE TABLE IF NOT EXISTS order_payments (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method_id uuid REFERENCES payment_methods(id),
  method text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'paid',
  provider text,
  external_reference text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_reference)
);

CREATE TABLE IF NOT EXISTS service_order_events (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text,
  notes text,
  actor_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_order_events_os_idx ON service_order_events(business_id, service_order_id, created_at);

CREATE TABLE IF NOT EXISTS service_order_parts (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_cost numeric(14,2),
  unit_price numeric(14,2) NOT NULL,
  total numeric(14,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS service_order_attachments (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'photo',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS assigned_technician_id uuid REFERENCES users(id);
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending';
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS warranty_until date;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;

CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id),
  name text NOT NULL,
  document_number text,
  birth_date date,
  phone text,
  email text,
  emergency_contact_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  allergies text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patients_business_name_idx ON patients(business_id, name);

CREATE TABLE IF NOT EXISTS clinical_records (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES professionals(id),
  record_type text NOT NULL,
  title text NOT NULL,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinical_records_patient_idx ON clinical_records(business_id, patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS clinical_procedures (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id),
  professional_id uuid REFERENCES professionals(id),
  service_id uuid REFERENCES services(id),
  appointment_id uuid REFERENCES appointments(id),
  status text NOT NULL DEFAULT 'scheduled',
  notes text,
  performed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinical_attachments (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinical_record_id uuid REFERENCES clinical_records(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS membership_plans (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(14,2) NOT NULL,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  duration_months integer,
  checkin_limit integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  plan_id uuid NOT NULL REFERENCES membership_plans(id),
  status text NOT NULL DEFAULT 'active',
  starts_on date NOT NULL,
  ends_on date,
  next_due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enrollments_business_status_idx ON enrollments(business_id, status, next_due_date);

CREATE TABLE IF NOT EXISTS membership_installments (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  receivable_id uuid REFERENCES receivables(id),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, due_date)
);

CREATE TABLE IF NOT EXISTS studio_classes (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES business_units(id),
  name text NOT NULL,
  professional_id uuid REFERENCES professionals(id),
  capacity integer,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_enrollments (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES studio_classes(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, enrollment_id)
);

CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES enrollments(id),
  class_id uuid REFERENCES studio_classes(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'staff',
  created_by uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS checkins_business_time_idx ON checkins(business_id, checked_in_at DESC);

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  provider text,
  external_reference text,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  paid_at timestamptz,
  pix_copy_paste text,
  invoice_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_reference)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_code text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT true,
  whatsapp boolean NOT NULL DEFAULT false,
  sms boolean NOT NULL DEFAULT false,
  push boolean NOT NULL DEFAULT false,
  PRIMARY KEY (business_id, user_id, event_code)
);

CREATE TABLE IF NOT EXISTS business_quotas (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  storage_bytes bigint NOT NULL DEFAULT 0,
  storage_limit_bytes bigint,
  users_count integer NOT NULL DEFAULT 0,
  sites_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
