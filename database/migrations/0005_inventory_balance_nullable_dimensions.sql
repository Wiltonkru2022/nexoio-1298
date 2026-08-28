-- A product can have inventory without a variant and/or lot.
-- Composite primary keys force all columns to NOT NULL, so use a NULLS NOT DISTINCT unique index instead.
ALTER TABLE inventory_balances DROP CONSTRAINT IF EXISTS inventory_balances_pkey;
ALTER TABLE inventory_balances ALTER COLUMN variant_id DROP NOT NULL;
ALTER TABLE inventory_balances ALTER COLUMN lot_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_balances_dimensions_uidx
  ON inventory_balances (business_id, location_id, product_id, variant_id, lot_id) NULLS NOT DISTINCT;
