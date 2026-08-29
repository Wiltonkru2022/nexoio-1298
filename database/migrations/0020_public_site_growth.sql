CREATE TABLE IF NOT EXISTS public_site_leads (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'website',
  name text NOT NULL,
  email text,
  phone text,
  message text,
  status text NOT NULL DEFAULT 'new',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_site_leads_business_status_idx ON public_site_leads(business_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS public_booking_requests (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id),
  service_id uuid REFERENCES services(id),
  professional_id uuid REFERENCES professionals(id),
  requested_start timestamptz NOT NULL,
  requested_end timestamptz,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  appointment_id uuid REFERENCES appointments(id),
  source text NOT NULL DEFAULT 'website',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_booking_requests_business_idx ON public_booking_requests(business_id,status,requested_start);

CREATE TABLE IF NOT EXISTS public_site_integrations (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  google_analytics_id text,
  meta_pixel_id text,
  google_maps_url text,
  whatsapp_url text,
  instagram_url text,
  lead_notifications_enabled boolean NOT NULL DEFAULT true,
  booking_auto_confirm boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_site_events (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  page_path text,
  visitor_hash text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_site_events_business_event_idx ON public_site_events(business_id,event_name,created_at DESC);
