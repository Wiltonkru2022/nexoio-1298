ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_code text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS error_message text;
CREATE INDEX IF NOT EXISTS notifications_user_status_idx ON notifications(business_id, user_id, read_at, created_at DESC);

ALTER TABLE business_quotas ADD COLUMN IF NOT EXISTS last_recalculated_at timestamptz;
