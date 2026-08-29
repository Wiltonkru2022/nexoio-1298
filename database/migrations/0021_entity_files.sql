CREATE TABLE IF NOT EXISTS entity_files (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('business','product','service_order','patient','clinical_record','document')),
  entity_id uuid,
  purpose text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,file_id,entity_type,entity_id,purpose)
);
CREATE INDEX IF NOT EXISTS entity_files_entity_idx ON entity_files(business_id,entity_type,entity_id,purpose,sort_order);
ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_image_file_id uuid REFERENCES files(id);
