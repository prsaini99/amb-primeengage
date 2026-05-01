-- 0013 · 2026-04-29 · ambassador-platform repo
--
-- Add razorpay_order_id column to amb_orders so admin can correlate with
-- Razorpay's dashboard / support tickets.
--
-- Existing column amb_orders.payment_ref already stores the Razorpay
-- *payment* id (pay_xxx), set by amb_finalize_paid_order from the verified
-- handler callback. We were not storing the Razorpay *order* id
-- (order_xxx) that gets minted upstream during /payment-init.
--
-- This is a value-add for support/audit only — no logic depends on it.
-- Indexed because admin will sometimes look up orders by razorpay_order_id
-- when copy-pasting from Razorpay dashboard URLs.
--
-- Idempotent. Already applied to live project zpciertrkqwzuuektzpj on
-- 2026-04-29 via the Supabase Management API.

ALTER TABLE public.amb_orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id text;

CREATE INDEX IF NOT EXISTS amb_orders_razorpay_order_id_idx
  ON public.amb_orders (razorpay_order_id);
