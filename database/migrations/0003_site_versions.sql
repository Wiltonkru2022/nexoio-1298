CREATE TABLE IF NOT EXISTS "business_site_versions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "label" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "config_json" jsonb NOT NULL,
  "scheduled_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "business_site_versions_business_id_version_unique" UNIQUE("business_id","version")
);
CREATE INDEX IF NOT EXISTS "business_site_versions_business_idx" ON "business_site_versions" USING btree ("business_id","created_at");
