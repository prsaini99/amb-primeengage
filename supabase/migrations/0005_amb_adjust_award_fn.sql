-- 0005 · 2026-04-25 · ambassador-platform repo
--
-- Postgres function `amb_adjust_award_submission` — adjusts the points on an
-- already-awarded submission. The ledger is append-only; this writes a new
-- row with reason='admin_adjustment' for the delta (new − current) and keeps
-- amb_submissions.awarded_points in sync with the new total.
--
-- Why append vs. overwrite: the ledger is the source of truth for balance.
-- Modifying historical entries would lose the audit trail. The schema CHECK
-- on amb_points_ledger.reason explicitly allows 'admin_adjustment' for this
-- case (§4.10).
--
-- Status guard: function refuses if submission is not 'awarded'. Use
-- amb_award_submission (migration 0004) for the initial award.
--
-- No-op handling: adjusting to the same value writes no ledger row but does
-- re-stamp reviewed_by + reviewed_at to mark the touch.
--
-- Already applied to live project zpciertrkqwzuuektzpj on 2026-04-25 via
-- the Supabase Management API.

CREATE OR REPLACE FUNCTION public.amb_adjust_award_submission(
  p_submission_id uuid,
  p_new_points    int,
  p_reviewer_id   uuid
)
RETURNS uuid -- ledger entry id, or null if no adjustment delta
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

  -- Current effective total = sum of all ledger entries for this submission
  -- (initial award + any prior adjustments).
  SELECT COALESCE(SUM(delta), 0)::int
    INTO v_current
    FROM public.amb_points_ledger
    WHERE reference_id = p_submission_id;

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
    'admin_adjustment',
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
