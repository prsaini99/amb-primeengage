-- 0015 · 2026-05-04 · ambassador-platform repo
--
-- Retire the global points_to_inr_rate. Tiers (migration 0014) own the
-- rate now; the fallback to amb_settings inside amb_init_paid_order is
-- gone, and the amb_settings table is dropped — it had only ever held
-- the one rate row.
--
-- Two changes:
--   (1) amb_init_paid_order: drop the fallback branch. If amb_user_tier()
--       returns no row, raise — that means somebody nuked the tiers
--       table and the system is mis-seeded; refusing the order is the
--       right call.
--   (2) DROP TABLE amb_settings.
--
-- Idempotent (CREATE OR REPLACE FUNCTION + DROP TABLE IF EXISTS).

------------------------------------------------------------------------------
-- (1) amb_init_paid_order — tier-only rate, no fallback.
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

  -- Tier-driven rate. No fallback — rank 1 has threshold 0 by seed
  -- invariant, so amb_user_tier() must return a row in steady state.
  -- If it doesn't, refuse to price the order.
  SELECT t.tier_points_to_inr_rate INTO v_rate FROM public.amb_user_tier(p_user_id) t;
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'No tier rate configured for this user — check amb_tiers seed.'
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

------------------------------------------------------------------------------
-- (2) Drop the legacy global-settings table.
------------------------------------------------------------------------------
DROP TABLE IF EXISTS public.amb_settings;
