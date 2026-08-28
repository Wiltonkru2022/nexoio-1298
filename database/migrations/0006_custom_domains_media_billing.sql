ALTER TABLE business_domains ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'cloudflare';
ALTER TABLE business_domains ADD COLUMN IF NOT EXISTS provider_hostname_id text;
ALTER TABLE business_domains ADD COLUMN IF NOT EXISTS dns_target text;
ALTER TABLE business_domains ADD COLUMN IF NOT EXISTS validation_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE business_domains ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS business_domains_provider_id_uidx ON business_domains(provider, provider_hostname_id) WHERE provider_hostname_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_domains_status_idx ON business_domains(business_id, verification_status, ssl_status);

ALTER TABLE files ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE files ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'general';
CREATE INDEX IF NOT EXISTS files_quota_idx ON files(business_id, deleted_at, created_at);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_customer_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_subscription_uidx ON subscriptions(provider, provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;

ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS billing_method text;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb;
