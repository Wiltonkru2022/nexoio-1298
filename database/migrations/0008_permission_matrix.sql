CREATE TABLE IF NOT EXISTS membership_permission_overrides (
  membership_id uuid NOT NULL REFERENCES business_memberships(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  allowed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, permission_code)
);

CREATE TABLE IF NOT EXISTS role_policy_limits (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  policy_key text NOT NULL,
  numeric_value numeric(14,4),
  text_value text,
  boolean_value boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, policy_key)
);

CREATE INDEX IF NOT EXISTS permission_overrides_membership_idx ON membership_permission_overrides(membership_id, allowed);
