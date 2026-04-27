-- 0011 · 2026-04-25 · ambassador-platform repo
--
-- Differentiate award-adjustments from order-refunds in amb_points_ledger.
--
-- Background: 0010 scoped "earned" to reason='submission_awarded' to keep
-- refunds out of the leaderboard. But amb_adjust_award_submission also
-- writes 'admin_adjustment' rows when admin corrects an awarded amount —
-- those ARE legitimate earnings and should count. Two distinct semantics
-- were collapsed into one reason. This migration splits them.
--
-- Changes:
--   1. CHECK constraint on amb_points_ledger.reason gains 'award_adjustment'
--   2. amb_adjust_award_submission writes 'award_adjustment' going forward
--   3. amb_cancel_order keeps writing 'admin_adjustment' for refunds (no
--      change there — refunds are correctly excluded from earnings)
--   4. Backfill: existing admin_adjustment rows that originated from
--      award adjustments are re-tagged. We identify them by the note
--      pattern 'Adjusted from%' (cancellation notes start with 'Order
--      cancelled%').
--   5. amb_v_leaderboard counts BOTH submission_awarded AND
--      award_adjustment as earned.
--
-- Idempotent: CHECK ALTER + CREATE OR REPLACE FUNCTION + targeted UPDATE.
-- Already applied to live project zpciertrkqwzuuektzpj on 2026-04-25 via
-- the Supabase Management API.

-- 1. Extend the CHECK constraint to include the new reason.
ALTER TABLE public.amb_points_ledger
  DROP CONSTRAINT IF EXISTS amb_points_ledger_reason_check;
ALTER TABLE public.amb_points_ledger
  ADD CONSTRAINT amb_points_ledger_reason_check
  CHECK (reason IN ('submission_awarded','order_redemption','admin_adjustment','award_adjustment'));

-- 2. Backfill: rows from amb_adjust_award_submission have notes that start
--    with 'Adjusted from'. Cancellation refunds start with 'Order cancelled'.
--    Anything else in admin_adjustment stays — that's a true admin gift.
UPDATE public.amb_points_ledger
SET reason = 'award_adjustment'
WHERE reason = 'admin_adjustment'
  AND note LIKE 'Adjusted from%';

-- 3. Update amb_adjust_award_submission to write the new reason going forward.
CREATE OR REPLACE FUNCTION public.amb_adjust_award_submission(
  p_submission_id uuid,
  p_new_points    int,
  p_reviewer_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id   uuid;
  v_status    text;
  v_current   int;
  v_delta     int;
  v_ledger_id uuid;
BEGIN
  IF p_new_points IS NULL OR p_new_points < 0 OR p_new_points > 100000 THEN
    RAISE EXCEPTION 'Points must be between 0 and 100,000.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT user_id, status
    INTO v_user_id, v_status
    FROM public.amb_submissions
    WHERE id = p_submission_id
    FOR UPDATE;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Submission not found.'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> 'awarded' THEN
    RAISE EXCEPTION 'Only awarded submissions can be adjusted (current: %).', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Sum BOTH original submission_awarded AND prior award_adjustment rows so
  -- "current" reflects the real running total (post-0011 + pre-0011 alike).
  SELECT COALESCE(SUM(delta), 0)::int
    INTO v_current
    FROM public.amb_points_ledger
    WHERE reference_id = p_submission_id
      AND reason IN ('submission_awarded','award_adjustment');

  v_delta := p_new_points - v_current;

  IF v_delta = 0 THEN
    UPDATE public.amb_submissions
      SET reviewed_by = p_reviewer_id,
          reviewed_at = NOW()
      WHERE id = p_submission_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.amb_points_ledger (user_id, delta, reason, reference_id, note)
  VALUES (
    v_user_id,
    v_delta,
    'award_adjustment',
    p_submission_id,
    format('Adjusted from %s to %s by admin', v_current, p_new_points)
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.amb_submissions
    SET awarded_points = p_new_points,
        reviewed_by    = p_reviewer_id,
        reviewed_at    = NOW()
    WHERE id = p_submission_id;

  RETURN v_ledger_id;
END;
$$;

-- 4. Leaderboard: count submission_awarded + award_adjustment as earned.
--    admin_adjustment (refunds, future bonuses) stays excluded.
CREATE OR REPLACE VIEW public.amb_v_leaderboard AS
SELECT
  p.id          AS user_id,
  p.first_name,
  p.last_name,
  COALESCE(SUM(l.delta), 0)::int AS total_earned
FROM public.amb_profiles p
LEFT JOIN public.amb_points_ledger l
  ON l.user_id = p.id
  AND l.reason IN ('submission_awarded','award_adjustment')
WHERE p.role = 'ambassador' AND p.status = 'approved'
GROUP BY p.id, p.first_name, p.last_name
ORDER BY total_earned DESC;
