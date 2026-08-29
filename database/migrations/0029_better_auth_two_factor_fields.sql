ALTER TABLE auth_two_factors
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE auth_two_factors
  ADD COLUMN IF NOT EXISTS failed_verification_count integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE auth_two_factors
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;
