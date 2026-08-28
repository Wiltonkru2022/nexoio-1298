CREATE TABLE IF NOT EXISTS "module_records" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "module_code" text NOT NULL REFERENCES "modules"("key"),
  "name" text NOT NULL,
  "details" text,
  "status" text NOT NULL DEFAULT 'active',
  "data_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "module_records_business_module_idx"
  ON "module_records" ("business_id", "module_code", "created_at" DESC);
