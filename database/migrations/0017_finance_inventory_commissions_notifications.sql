CREATE TABLE IF NOT EXISTS chart_accounts (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  parent_id uuid REFERENCES chart_accounts(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,code)
);
ALTER TABLE financial_categories ADD COLUMN IF NOT EXISTS chart_account_id uuid REFERENCES chart_accounts(id);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  bank_code text,
  branch text,
  account_number_masked text,
  kind text NOT NULL DEFAULT 'checking',
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,name)
);
CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  external_id text,
  posted_on date NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'unmatched',
  matched_entity_type text,
  matched_entity_id uuid,
  reconciled_by uuid REFERENCES users(id),
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,bank_account_id,external_id)
);
CREATE INDEX IF NOT EXISTS bank_transactions_match_idx ON bank_transactions(business_id,status,posted_on DESC);

CREATE TABLE IF NOT EXISTS financial_ledger (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('income','expense')),
  source_type text NOT NULL,
  source_id uuid,
  category_id uuid REFERENCES financial_categories(id),
  chart_account_id uuid REFERENCES chart_accounts(id),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  competence_date date NOT NULL,
  cash_date date,
  status text NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_ledger_period_idx ON financial_ledger(business_id,competence_date,entry_type);
CREATE INDEX IF NOT EXISTS financial_ledger_cash_idx ON financial_ledger(business_id,cash_date,entry_type);

CREATE TABLE IF NOT EXISTS inventory_counts (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES inventory_locations(id),
  status text NOT NULL DEFAULT 'draft',
  notes text,
  started_by uuid REFERENCES users(id),
  completed_by uuid REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS inventory_count_items (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  count_id uuid NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  variant_id uuid REFERENCES product_variants(id),
  lot_id uuid REFERENCES inventory_lots(id),
  expected_quantity numeric(14,3) NOT NULL DEFAULT 0,
  counted_quantity numeric(14,3),
  difference numeric(14,3),
  UNIQUE (count_id,product_id,variant_id,lot_id)
);
CREATE TABLE IF NOT EXISTS inventory_transfers (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  from_location_id uuid NOT NULL REFERENCES inventory_locations(id),
  to_location_id uuid NOT NULL REFERENCES inventory_locations(id),
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid REFERENCES users(id),
  completed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (from_location_id <> to_location_id)
);
CREATE TABLE IF NOT EXISTS inventory_transfer_items (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  variant_id uuid REFERENCES product_variants(id),
  lot_id uuid REFERENCES inventory_lots(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS commission_batches (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  closed_by uuid REFERENCES users(id),
  paid_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  paid_at timestamptz,
  CHECK (period_end >= period_start)
);
CREATE TABLE IF NOT EXISTS commission_batch_items (
  batch_id uuid NOT NULL REFERENCES commission_batches(id) ON DELETE CASCADE,
  commission_id uuid NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  PRIMARY KEY (batch_id,commission_id)
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  event_code text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('internal','email','whatsapp','sms','push')),
  name text NOT NULL,
  subject_template text,
  body_template text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,event_code,channel)
);
CREATE TABLE IF NOT EXISTS notification_outbox (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  customer_id uuid REFERENCES customers(id),
  event_code text NOT NULL,
  channel text NOT NULL,
  destination text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx ON notification_outbox(status,next_attempt_at,created_at);
