ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES sales(id);
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES quotes(id);

CREATE TABLE IF NOT EXISTS promotions (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed','price')),
  discount_value numeric(14,2) NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  minimum_amount numeric(14,2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS promotion_products (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, product_id)
);
CREATE INDEX IF NOT EXISTS promotions_business_period_idx ON promotions(business_id,active,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS service_order_payments (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  sale_payment_id uuid REFERENCES sale_payments(id),
  method text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'paid',
  created_by uuid REFERENCES users(id),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_order_payments_os_idx ON service_order_payments(business_id,service_order_id,created_at DESC);
