-- 0008 · 2026-04-25 · ambassador-platform repo
--
-- Phase 2 §6.7/§6.8 schema: rewards store. Three tables + one bucket + a
-- settings seed.
--
-- Pricing model (§4.8): every product has BOTH points_cost and inr_cost.
--   - points_cost > 0, inr_cost = 0  → pure-points redemption
--   - points_cost = 0, inr_cost > 0  → pure-money purchase
--   - both > 0                       → hybrid (points + money)
-- Phase 2 ships pure-points only; money + hybrid show in the store but
-- their redeem button stays disabled until Phase 3 wires Razorpay.
--
-- Vouchers (§6.7 note): in v1 the admin delivers codes offline (chat/
-- email). amb_orders.admin_notes carries the code. Auto-generation +
-- voucher_codes table is Phase 4.
--
-- Settings: amb_settings is a key/value store. Seed
--   { points_to_inr_rate: 0.10 } → 100 points = ₹10. This is a display /
--   reference value only — products carry their own absolute prices.
--
-- Idempotent. Already applied to live project zpciertrkqwzuuektzpj on
-- 2026-04-25 via the Supabase Management API.

------------------------------------------------------------------------------
-- amb_products (§4.8)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amb_products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL CHECK (type IN ('merchandise','voucher')),
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  image_url    text,
  points_cost  int NOT NULL CHECK (points_cost >= 0),
  inr_cost     numeric(10,2) NOT NULL CHECK (inr_cost >= 0),
  stock        int CHECK (stock IS NULL OR stock >= 0),
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- A product must cost SOMETHING — either points or money or both.
  CONSTRAINT amb_products_has_price CHECK (points_cost > 0 OR inr_cost > 0)
);
CREATE INDEX IF NOT EXISTS amb_products_is_active_idx ON public.amb_products (is_active);
CREATE INDEX IF NOT EXISTS amb_products_type_idx     ON public.amb_products (type);
CREATE INDEX IF NOT EXISTS amb_products_created_at_idx ON public.amb_products (created_at DESC);
ALTER TABLE public.amb_products ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------------
-- amb_orders (§4.9)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amb_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.amb_profiles(id) ON DELETE RESTRICT,
  product_id          uuid NOT NULL REFERENCES public.amb_products(id) ON DELETE RESTRICT,
  points_used         int  NOT NULL CHECK (points_used >= 0),
  inr_paid            numeric(10,2) NOT NULL DEFAULT 0 CHECK (inr_paid >= 0),
  payment_status      text NOT NULL CHECK (payment_status IN ('not_required','pending','paid','failed')),
  payment_ref         text,
  fulfillment_status  text NOT NULL DEFAULT 'pending' CHECK (fulfillment_status IN ('pending','fulfilled','cancelled')),
  admin_notes         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS amb_orders_user_id_idx            ON public.amb_orders (user_id);
CREATE INDEX IF NOT EXISTS amb_orders_product_id_idx         ON public.amb_orders (product_id);
CREATE INDEX IF NOT EXISTS amb_orders_payment_status_idx     ON public.amb_orders (payment_status);
CREATE INDEX IF NOT EXISTS amb_orders_fulfillment_status_idx ON public.amb_orders (fulfillment_status);
CREATE INDEX IF NOT EXISTS amb_orders_created_at_idx         ON public.amb_orders (created_at DESC);
ALTER TABLE public.amb_orders ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------------
-- amb_settings (§4.11) — global key/value with jsonb value.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amb_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.amb_settings ENABLE ROW LEVEL SECURITY;

-- Seed the points-to-INR display rate (100 pts = ₹10).
INSERT INTO public.amb_settings (key, value)
VALUES ('points_to_inr_rate', to_jsonb(0.10))
ON CONFLICT (key) DO NOTHING;

------------------------------------------------------------------------------
-- Storage bucket: amb_products (public, for product images)
------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'amb_products', 'amb_products', true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
