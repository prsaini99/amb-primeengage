-- 0014 · 2026-05-04 · ambassador-platform repo
--
-- Tier system for Yuvaah Club members. Five admin-managed tiers, each
-- with its own name, threshold, and points_to_inr_rate. Tier is derived
-- from LIFETIME EARNED points (sum of submission_awarded +
-- award_adjustment ledger reasons — same metric the dashboard already
-- shows as "Total earned"). Spending points NEVER demotes — it's a
-- loyalty ladder, not a balance gauge.
--
-- The hybrid Razorpay checkout (amb_init_paid_order) now reads the
-- rate from the user's tier instead of the global
-- amb_settings.points_to_inr_rate. The global setting stays as a
-- defensive fallback; nothing else reads it for pricing decisions.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS, INSERT … ON CONFLICT DO
-- NOTHING, CREATE OR REPLACE FUNCTION).

------------------------------------------------------------------------------
-- amb_tiers — admin-managed loyalty tiers.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amb_tiers (
  rank               int PRIMARY KEY CHECK (rank BETWEEN 1 AND 5),
  name               text NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  threshold_points   int  NOT NULL CHECK (threshold_points >= 0),
  points_to_inr_rate numeric NOT NULL CHECK (points_to_inr_rate > 0),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.amb_tiers ENABLE ROW LEVEL SECURITY;

-- Seed five default tiers. Admin renames / re-thresholds / re-rates from
-- the /admin/tiers UI. Rank 1 starts at 0 so every approved member
-- qualifies for at least the lowest tier on day one.
INSERT INTO public.amb_tiers (rank, name, threshold_points, points_to_inr_rate) VALUES
  (1, 'Bronze',   0,     0.10),
  (2, 'Silver',   500,   0.12),
  (3, 'Gold',     2000,  0.15),
  (4, 'Platinum', 5000,  0.18),
  (5, 'Diamond',  10000, 0.20)
ON CONFLICT (rank) DO NOTHING;

------------------------------------------------------------------------------
-- amb_user_tier(p_user_id) — derive the user's current tier from lifetime
-- earned points. Returns the row matching the highest rank where
-- threshold_points <= lifetime_earned, plus convenience fields the UI
-- needs (lifetime_earned and the next tier's threshold for the progress
-- bar). Always returns exactly one row in steady state because rank 1
-- has threshold 0 by seed invariant.
------------------------------------------------------------------------------
-- OUT parameter names are deliberately prefixed `tier_*` to avoid the
-- "column reference is ambiguous" error PL/pgSQL throws when an OUT param
-- shadows a referenced table column. Drop-then-create because changing
-- the row type isn't allowed with CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.amb_user_tier(uuid);
CREATE FUNCTION public.amb_user_tier(p_user_id uuid)
RETURNS TABLE (
  tier_rank               int,
  tier_name               text,
  tier_threshold_points   int,
  tier_points_to_inr_rate numeric,
  lifetime_earned         int,
  next_threshold          int
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_earned int;
BEGIN
  SELECT COALESCE(SUM(delta), 0)::int
    INTO v_earned
    FROM public.amb_points_ledger
   WHERE user_id = p_user_id
     AND reason IN ('submission_awarded', 'award_adjustment');

  RETURN QUERY
    WITH current_tier AS (
      SELECT t.rank, t.name, t.threshold_points, t.points_to_inr_rate
        FROM public.amb_tiers t
       WHERE t.threshold_points <= v_earned
       ORDER BY t.rank DESC
       LIMIT 1
    )
    SELECT
      c.rank,
      c.name,
      c.threshold_points,
      c.points_to_inr_rate,
      v_earned,
      (SELECT MIN(t2.threshold_points)::int
         FROM public.amb_tiers t2
        WHERE t2.rank > c.rank)
      FROM current_tier c;
END;
$$;

------------------------------------------------------------------------------
-- amb_init_paid_order — replace the global-rate lookup with a tier-aware
-- one. Logic is otherwise identical to migration 0012's version.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.amb_init_paid_order(
  p_user_id            uuid,
  p_product_id         uuid,
  p_points_to_use      int,
  p_inr_amount_paise   int
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_points_cost  int;
  v_inr_cost     numeric(10,2);
  v_stock        int;
  v_active       boolean;
  v_balance      int;
  v_rate         numeric;
  v_expected     int;
  v_tolerance    int := 1;
  v_order_id     uuid;
BEGIN
  SELECT points_cost, inr_cost, stock, is_active
    INTO v_points_cost, v_inr_cost, v_stock, v_active
    FROM public.amb_products
    WHERE id = p_product_id
    FOR UPDATE;

  IF v_points_cost IS NULL THEN
    RAISE EXCEPTION 'Product not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Product is archived.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_inr_cost > 0 THEN
    RAISE EXCEPTION 'This product has an intrinsic INR price; hybrid not supported.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_stock IS NOT NULL AND v_stock <= 0 THEN
    RAISE EXCEPTION 'Out of stock.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_points_to_use < 0 OR p_points_to_use > v_points_cost THEN
    RAISE EXCEPTION 'points_to_use out of range (0..%).', v_points_cost
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_inr_amount_paise <= 0 THEN
    RAISE EXCEPTION 'Hybrid orders require a positive INR amount.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(delta), 0)::int
    INTO v_balance
    FROM public.amb_points_ledger
    WHERE user_id = p_user_id;

  IF v_balance < p_points_to_use THEN
    RAISE EXCEPTION 'Insufficient balance: have %, want to use %.', v_balance, p_points_to_use
      USING ERRCODE = 'check_violation';
  END IF;

  -- Tier-specific rate. Falls back to the legacy global setting if the
  -- tiers table somehow has no matching row (defensive — rank 1 with
  -- threshold 0 should always match in steady state).
  SELECT t.tier_points_to_inr_rate INTO v_rate FROM public.amb_user_tier(p_user_id) t;
  IF v_rate IS NULL THEN
    SELECT (value::text)::numeric INTO v_rate
      FROM public.amb_settings
      WHERE key = 'points_to_inr_rate';
  END IF;
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'No points_to_inr_rate configured for this user.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_expected := CEIL((v_points_cost - p_points_to_use) * v_rate * 100)::int;
  IF ABS(p_inr_amount_paise - v_expected) > v_tolerance THEN
    RAISE EXCEPTION 'INR amount mismatch: expected %, got %.', v_expected, p_inr_amount_paise
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.amb_orders (
    user_id, product_id, points_used, inr_paid, payment_status, fulfillment_status
  ) VALUES (
    p_user_id,
    p_product_id,
    p_points_to_use,
    p_inr_amount_paise::numeric / 100,
    'pending',
    'pending'
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;
