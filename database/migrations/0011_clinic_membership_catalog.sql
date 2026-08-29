CREATE TABLE IF NOT EXISTS clinical_procedure_catalog (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  duration_minutes integer,
  price numeric(14,2) NOT NULL DEFAULT 0,
  preparation text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
ALTER TABLE clinical_procedures ADD COLUMN IF NOT EXISTS procedure_catalog_id uuid REFERENCES clinical_procedure_catalog(id);

CREATE INDEX IF NOT EXISTS membership_installments_business_idx ON membership_installments(business_id,status,due_date);
CREATE INDEX IF NOT EXISTS clinical_procedure_catalog_business_idx ON clinical_procedure_catalog(business_id,active,name);
