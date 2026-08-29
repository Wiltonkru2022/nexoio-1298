CREATE TABLE IF NOT EXISTS order_checks (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_check_items (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  check_id uuid NOT NULL REFERENCES order_checks(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0)
);
CREATE TABLE IF NOT EXISTS order_payment_refunds (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_payment_id uuid NOT NULL REFERENCES order_payments(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  provider_reference text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_payment_refunds_payment_idx ON order_payment_refunds(business_id,order_payment_id);
CREATE TABLE IF NOT EXISTS order_reopen_events (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reason text NOT NULL,
  reopened_by uuid NOT NULL REFERENCES users(id),
  previous_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS print_jobs (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES business_units(id),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  kitchen_ticket_id uuid REFERENCES kitchen_tickets(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('kitchen','receipt','conference','label')),
  printer_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  printed_at timestamptz
);
CREATE INDEX IF NOT EXISTS print_jobs_queue_idx ON print_jobs(business_id,status,created_at);
