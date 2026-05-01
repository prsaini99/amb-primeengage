-- 0012 · 2026-04-25 · ambassador-platform repo
--
-- Phase 3 redemption flow update + Razorpay hybrid mode.
--
-- (1) Drop the admin "Mark fulfilled" gate. Pure-points redemptions now
--     auto-fulfill on creation. amb_create_order sets fulfillment_status =
--     'fulfilled' (was 'pending'). The Orders pages on both sides become
--     history / tracking surfaces, not approval queues.
--
-- (2) Add hybrid mode. Two new functions:
--       amb_init_paid_order   — creates a 'pending' order + records the
--                               payment intent. No ledger debit yet, no
--                               stock decrement yet.
--       amb_finalize_paid_order — after Razorpay confirms, flips
--                                 payment_status='paid', fulfillment_status
--                                 ='fulfilled', writes the ledger debit,
--                                 decrements stock.
--     The hybrid model is dynamic shortfall: product is pure-points
--     priced (inr_cost = 0), ambassador pays (points_cost − balance) ×
--     points_to_inr_rate when short. Products with intrinsic inr_cost > 0
--     stay out of scope.
--
-- (3) amb_cancel_order: drop the "fulfilled blocks cancel" guard. With
--     auto-fulfillment, every successful redemption is fulfilled the
--     instant it's created — admin needs to be able to cancel-and-refund
--     after that for return / error correction.
--
-- Idempotent (CREATE OR REPLACE FUNCTION). Already applied to live project
-- zpciertrkqwzuuektzpj on 2026-04-25 via the Supabase Management API.

------------------------------------------------------------------------------
-- (1) amb_create_order — auto-fulfill on creation
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.amb_create_order(
  p_user_id    uuid,
  p_product_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_points_cost int;
  v_inr_cost    numeric(10,2);
  v_stock       int;
  v_active      boolean;
  v_balance     int;
  v_order_id    uuid;
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
  -- Pure-points only goes through this path. Products with intrinsic INR
  -- pricing aren't supported in v1; hybrid (shortfall) flows through
  -- amb_init_paid_order instead.
  IF v_inr_cost > 0 THEN
    RAISE EXCEPTION 'Money payments are not yet supported (Phase 3).'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_stock IS NOT NULL AND v_stock <= 0 THEN
    RAISE EXCEPTION 'Out of stock.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(delta), 0)::int
    INTO v_balance
    FROM public.amb_points_ledger
    WHERE user_id = p_user_id;

  IF v_balance < v_points_cost THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %.', v_balance, v_points_cost
      USING ERRCODE = 'check_violation';
  END IF;

  -- Auto-fulfilled. The Orders surface is a history view, not a workflow.
  INSERT INTO public.amb_orders (
    user_id, product_id, points_used, inr_paid, payment_status, fulfillment_status
  ) VALUES (
    p_user_id, p_product_id, v_points_cost, 0, 'not_required', 'fulfilled'
  )
  RETURNING id INTO v_order_id;

  IF v_points_cost > 0 THEN
    INSERT INTO public.amb_points_ledger (user_id, delta, reason, reference_id)
    VALUES (p_user_id, -v_points_cost, 'order_redemption', v_order_id);
  END IF;

  IF v_stock IS NOT NULL THEN
    UPDATE public.amb_products SET stock = stock - 1 WHERE id = p_product_id;
  END IF;

  RETURN v_order_id;
END;
$$;

------------------------------------------------------------------------------
-- (2a) amb_init_paid_order — hybrid mode: create pending order pre-payment
------------------------------------------------------------------------------
-- Server computes the INR shortfall in paise (integer) so we never lose
-- sub-paise precision in JSON / float round-trips. The function recomputes
-- the expected shortfall server-side and rejects mismatches; this prevents
-- a malicious client from claiming inr_amount_paise = 0.
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
  v_tolerance    int := 1;  -- paise rounding tolerance
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
  -- Hybrid path is for pure-points products only in v1.
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

  -- Re-derive expected paise from the live rate and reject mismatches.
  SELECT (value::text)::numeric
    INTO v_rate
    FROM public.amb_settings
    WHERE key = 'points_to_inr_rate';
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'points_to_inr_rate is not configured.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_expected := CEIL((v_points_cost - p_points_to_use) * v_rate * 100)::int;
  IF ABS(p_inr_amount_paise - v_expected) > v_tolerance THEN
    RAISE EXCEPTION 'INR amount mismatch: expected %, got %.', v_expected, p_inr_amount_paise
      USING ERRCODE = 'check_violation';
  END IF;

  -- Pending order. No ledger write, no stock decrement until finalize.
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
-- (2b) amb_finalize_paid_order — atomic: mark paid, debit ledger, dec stock
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.amb_finalize_paid_order(
  p_order_id      uuid,
  p_payment_ref   text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id     uuid;
  v_product_id  uuid;
  v_points_used int;
  v_payment_st  text;
  v_balance     int;
  v_stock       int;
  v_active      boolean;
BEGIN
  SELECT user_id, product_id, points_used, payment_status
    INTO v_user_id, v_product_id, v_points_used, v_payment_st
    FROM public.amb_orders
    WHERE id = p_order_id
    FOR UPDATE;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_payment_st <> 'pending' THEN
    RAISE EXCEPTION 'Order is not awaiting payment (current: %).', v_payment_st
      USING ERRCODE = 'check_violation';
  END IF;

  -- Re-validate product state. If the admin archived the product or stock
  -- went to 0 between init and finalize, the user has paid for something
  -- we can't deliver — bail and let admin handle the refund manually via
  -- the Razorpay dashboard. The order stays 'pending'.
  SELECT is_active, stock
    INTO v_active, v_stock
    FROM public.amb_products
    WHERE id = v_product_id
    FOR UPDATE;

  IF v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Product is no longer active — refund the payment.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_stock IS NOT NULL AND v_stock <= 0 THEN
    RAISE EXCEPTION 'Product is out of stock — refund the payment.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Re-validate that the points are still available. Rare race: ambassador
  -- spent points elsewhere during the ~10s payment window.
  SELECT COALESCE(SUM(delta), 0)::int
    INTO v_balance
    FROM public.amb_points_ledger
    WHERE user_id = v_user_id;

  IF v_balance < v_points_used THEN
    RAISE EXCEPTION 'Balance dropped below required points during payment — refund manually.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.amb_orders
  SET payment_status     = 'paid',
      payment_ref        = p_payment_ref,
      fulfillment_status = 'fulfilled'
  WHERE id = p_order_id;

  IF v_points_used > 0 THEN
    INSERT INTO public.amb_points_ledger (user_id, delta, reason, reference_id)
    VALUES (v_user_id, -v_points_used, 'order_redemption', p_order_id);
  END IF;

  IF v_stock IS NOT NULL THEN
    UPDATE public.amb_products SET stock = stock - 1 WHERE id = v_product_id;
  END IF;
END;
$$;

------------------------------------------------------------------------------
-- (3) amb_cancel_order — drop the "fulfilled blocks cancel" guard
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.amb_cancel_order(
  p_order_id    uuid,
  p_admin_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id     uuid;
  v_product_id  uuid;
  v_points_used int;
  v_payment_st  text;
  v_fulfill_st  text;
  v_was_stock   int;
BEGIN
  SELECT user_id, product_id, points_used, payment_status, fulfillment_status
    INTO v_user_id, v_product_id, v_points_used, v_payment_st, v_fulfill_st
    FROM public.amb_orders
    WHERE id = p_order_id
    FOR UPDATE;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_fulfill_st = 'cancelled' THEN
    RAISE EXCEPTION 'Order is already cancelled.' USING ERRCODE = 'check_violation';
  END IF;
  -- The "fulfilled blocks cancel" guard is intentionally gone: with
  -- auto-fulfillment, every order is fulfilled the moment it's created;
  -- admin must be able to refund/cancel after delivery for the return
  -- use case. Cancelled stands as the final disposition either way.

  UPDATE public.amb_orders
  SET fulfillment_status = 'cancelled',
      admin_notes        = COALESCE(p_admin_notes, admin_notes)
  WHERE id = p_order_id;

  -- Refund only points-paid orders (payment_status='not_required'). Money
  -- refunds for paid hybrid orders are handled manually via the Razorpay
  -- dashboard in v1. Pending hybrid orders had no debit yet — nothing to
  -- refund.
  IF v_payment_st = 'not_required' AND v_points_used > 0 THEN
    INSERT INTO public.amb_points_ledger (
      user_id, delta, reason, reference_id, note
    ) VALUES (
      v_user_id, v_points_used, 'admin_adjustment', p_order_id,
      'Order cancelled — points refunded'
    );
  END IF;

  -- Restore stock only if it was decremented at order time. Pending hybrid
  -- orders never decremented stock (decrement happens at finalize), so we
  -- only restore for non-pending orders.
  IF v_payment_st <> 'pending' THEN
    SELECT stock INTO v_was_stock FROM public.amb_products WHERE id = v_product_id;
    IF v_was_stock IS NOT NULL THEN
      UPDATE public.amb_products SET stock = stock + 1 WHERE id = v_product_id;
    END IF;
  END IF;
END;
$$;
