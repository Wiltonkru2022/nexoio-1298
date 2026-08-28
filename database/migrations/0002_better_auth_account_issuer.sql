ALTER TABLE "auth_accounts" ADD COLUMN IF NOT EXISTS "issuer" text;
--> statement-breakpoint
UPDATE "auth_accounts"
SET "issuer" = CASE
  WHEN "provider_id" = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || "provider_id"
END
WHERE "issuer" IS NULL;
--> statement-breakpoint
ALTER TABLE "auth_accounts" ALTER COLUMN "issuer" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_accounts_issuer_account_id_uidx" ON "auth_accounts" ("issuer", "account_id");
