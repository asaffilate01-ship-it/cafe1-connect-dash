ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS uber_direct_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uber_direct_max_radius_m integer NOT NULL DEFAULT 8000,
  ADD COLUMN IF NOT EXISTS uber_direct_test_mode boolean NOT NULL DEFAULT true;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_provider text,
  ADD COLUMN IF NOT EXISTS courier_status text,
  ADD COLUMN IF NOT EXISTS courier_external_id text,
  ADD COLUMN IF NOT EXISTS courier_tracking_url text,
  ADD COLUMN IF NOT EXISTS courier_fee_cents integer,
  ADD COLUMN IF NOT EXISTS courier_dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS courier_error text;

CREATE INDEX IF NOT EXISTS orders_courier_external_id_idx ON public.orders (courier_external_id);

ALTER TABLE public.driver_locations
  ALTER COLUMN driver_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS courier_name text;