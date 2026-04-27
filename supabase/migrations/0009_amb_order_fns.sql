-- 0009 · 2026-04-25 · ambassador-platform repo
--
-- Phase 2 §6.7 redemption + admin fulfillment workflow. Two functions:
--
--   amb_create_order(user_id, product_id) — atomic redemption:
--     - row-locks the product (stock race protection)
--     - validates active + in-stock
--     - validates Phase 2 constraint: inr_cost = 0 (pure-points only)
--     - validates the user has enough balance
--     - inserts the order with payment_status='not_required'
--     - inserts the negative ledger entry (debit)
--     - decrements stock if not unlimited
--   Phase 3 will branch this on inr_cost > 0 to create a 'pending' order
--   and defer the ledger debit to the payment webhook.
--
--   amb_cancel_order(order_id, admin_notes?) — atomic cancellation:
--     - row-locks the order
--     - flips fulfillment_status='cancelled'
--     - if the order was paid with points, inserts a positive ledger refund
--       (reason='admin_adjustment', so it doesn't double-count as earned
--       points on the leaderboard)
--   Refunds for money-paid orders (Phase 3) will be handled separately by
--   the payment webhook flow.
--
-- Idempotent. Already applied to live project zpciertrkqwzuuektzpj on
-- 2026-04-25 via the Supabase Management API.

------------------------------------------------------------------------------
-- amb_create_order
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
  -- Lock the product row to prevent concurrent stock decrements.
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
  -- Phase 2 gate: pure-points only. Phase 3 removes this branch and
  -- inserts the order as 'pending' instead, deferring the debit.
  IF v_inr_cost > 0 THEN
    RAISE EXCEPTION 'Money payments are not yet supported (Phase 3).'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_stock IS NOT NULL AND v_stock <= 0 THEN
    RAISE EXCEPTION 'Out of stock.' USING ERRCODE = 'check_violation';
  END IF;

  -- Compute the user's current balance.
  SELECT COALESCE(SUM(delta), 0)::int
    INTO v_balance
    FROM public.amb_points_ledger
    WHERE user_id = p_user_id;

  IF v_balance < v_points_cost THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %.', v_balance, v_points_cost
      USING ERRCODE = 'check_violation';
  END IF;

  -- Insert order. payment_status='not_required' since this is pure points.
  INSERT INTO public.amb_orders (
    user_id, product_id, points_used, inr_paid, payment_status, fulfillment_status
  ) VALUES (
    p_user_id, p_product_id, v_points_cost, 0, 'not_required', 'pending'
  )
  RETURNING id INTO v_order_id;

  -- Debit the ledger. reason='order_redemption' per the §4.10 enum.
  IF v_points_cost > 0 THEN
    INSERT INTO public.amb_points_ledger (
      user_id, delta, reason, reference_id
    ) VALUES (
      p_user_id, -v_points_cost, 'order_redemption', v_order_id
    );
  END IF;

  -- Decrement stock if it's tracked.
  IF v_stock IS NOT NULL THEN
    UPDATE public.amb_products
    SET stock = stock - 1
    WHERE id = p_product_id;
  END IF;

  RETURN v_order_id;
END;
$$;

------------------------------------------------------------------------------
-- amb_cancel_order
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
  IF v_fulfill_st = 'fulfilled' THEN
    RAISE EXCEPTION 'Order is already fulfilled — cancellation is no longer possible from the UI.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Flip status + stash notes (preserve prior notes if no new ones supplied).
  UPDATE public.amb_orders
  SET fulfillment_status = 'cancelled',
      admin_notes        = COALESCE(p_admin_notes, admin_notes)
  WHERE id = p_order_id;

  -- Refund the points only if they were debited (Phase 2: not_required only).
  -- For money-paid orders, refunds will route through the payment gateway in
  -- Phase 3 and never touch the ledger here.
  IF v_payment_st = 'not_required' AND v_points_used > 0 THEN
    INSERT INTO public.amb_points_ledger (
      user_id, delta, reason, reference_id, note
    ) VALUES (
      v_user_id, v_points_used, 'admin_adjustment', p_order_id,
      'Order cancelled — points refunded'
    );
  END IF;

  -- Restore stock if it was decremented at order time.
  SELECT stock INTO v_was_stock FROM public.amb_products WHERE id = v_product_id;
  IF v_was_stock IS NOT NULL THEN
    UPDATE public.amb_products
    SET stock = stock + 1
    WHERE id = v_product_id;
  END IF;
END;
$$;
