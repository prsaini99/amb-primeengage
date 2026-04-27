-- 0004 · 2026-04-25 · ambassador-platform repo
--
-- Postgres function `amb_award_submission` — atomic award of points for a
-- submission. Replaces the would-be tech-doc Edge Function `award-submission`
-- (per Phase 1 deviation in docs/migration-tasks.md #1, the work happens in a
-- Next.js Route Handler that calls this RPC).
--
-- Why a function and not "do both writes from the route handler":
--   1. Atomicity — UPDATE submissions + INSERT ledger in one transaction so
--      we never leave a "status='awarded' but no ledger row" state if the
--      second write fails.
--   2. Concurrency — SELECT ... FOR UPDATE row-locks the submission so a
--      double-click can't double-award. The one-shot guarantee from §6.3
--      becomes bulletproof under concurrent admin actions.
--   3. Encapsulation — same pattern future order/redemption flows will use.
--
-- Security: SECURITY INVOKER (default). The function relies on its caller
-- having SELECT/UPDATE/INSERT on the underlying tables; that's only true
-- for the service_role, which is only ever invoked server-side via
-- /api/admin/* route handlers gated by requireAdmin().
--
-- Idempotent: CREATE OR REPLACE FUNCTION. Safe to re-run.
-- Already applied to live project zpciertrkqwzuuektzpj on 2026-04-25 via
-- the Supabase Management API.

CREATE OR REPLACE FUNCTION public.amb_award_submission(
  p_submission_id uuid,
  p_points        int,
  p_reviewer_id   uuid
)
RETURNS uuid -- ledger entry id, or null if p_points = 0
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id   uuid;
  v_status    text;
  v_ledger_id uuid;
BEGIN
  IF p_points IS NULL OR p_points < 0 OR p_points > 100000 THEN
    RAISE EXCEPTION 'Points must be between 0 and 100,000.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the submission row so concurrent awards can't both succeed.
  SELECT user_id, status
    INTO v_user_id, v_status
    FROM public.amb_submissions
    WHERE id = p_submission_id
    FOR UPDATE;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Submission not found.'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> 'submitted' THEN
    RAISE EXCEPTION 'Submission is already %.', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.amb_submissions
    SET status         = 'awarded',
        awarded_points = p_points,
        reviewed_by    = p_reviewer_id,
        reviewed_at    = NOW()
    WHERE id = p_submission_id;

  -- Skip the ledger row for a 0-point award — keeps balance queries clean
  -- and doesn't create misleading "earned 0" entries in recent activity.
  IF p_points > 0 THEN
    INSERT INTO public.amb_points_ledger (user_id, delta, reason, reference_id)
    VALUES (v_user_id, p_points, 'submission_awarded', p_submission_id)
    RETURNING id INTO v_ledger_id;
  END IF;

  RETURN v_ledger_id;
END;
$$;
