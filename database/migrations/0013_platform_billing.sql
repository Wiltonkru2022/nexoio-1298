ALTER TABLE plans ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 0;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS provider_payment_id text;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS provider_subscription_id text;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS billing_type text;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS pix_qr_code_image text;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_invoices_provider_payment_uidx ON subscription_invoices(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscription_invoices_subscription_status_idx ON subscription_invoices(subscription_id,status,due_date DESC);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_type text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_due_date date;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS past_due_since timestamptz;

CREATE TABLE IF NOT EXISTS subscription_events (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_events_business_idx ON subscription_events(business_id,created_at DESC);
