CREATE TABLE IF NOT EXISTS clinical_record_versions (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  clinical_record_id uuid NOT NULL REFERENCES clinical_records(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid NOT NULL REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinical_record_id, version)
);
CREATE INDEX IF NOT EXISTS clinical_record_versions_record_idx ON clinical_record_versions(business_id,clinical_record_id,version DESC);

ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS grace_days integer NOT NULL DEFAULT 0;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS block_checkin_when_overdue boolean NOT NULL DEFAULT true;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS blocked_reason text;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS financial_status text NOT NULL DEFAULT 'current';

ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS delivered_by uuid REFERENCES users(id);

CREATE INDEX IF NOT EXISTS service_order_payments_status_idx ON service_order_payments(business_id,service_order_id,status);
CREATE INDEX IF NOT EXISTS membership_installments_due_idx ON membership_installments(business_id,status,due_date);
