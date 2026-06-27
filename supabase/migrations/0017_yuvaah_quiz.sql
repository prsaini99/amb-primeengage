-- 0017 · 2026-06-27 · ambassador-platform repo
--
-- Yuvaah Club quiz: rounds, questions, attempts. Admin-controlled, round-based
-- GK quiz; one attempt per active round; 10 random MCQs per member; points
-- credited to amb_points_ledger as a new 'quiz_score' reason.
--
-- Changes:
--   1. New tables yuvaah_quiz_rounds / _questions / _attempts (RLS on, no
--      policies — service-role only, matching the other amb_* module tables).
--   2. amb_points_ledger.reason CHECK gains 'quiz_score'.
--   3. amb_v_leaderboard counts 'quiz_score' as earned (alongside
--      submission_awarded + award_adjustment, per 0011).
--   4. amb_user_tier() counts 'quiz_score' as earned (per 0014).
--
-- Applied to live project zpciertrkqwzuuektzpj on 2026-06-27 via the Supabase
-- Management API (POST /v1/projects/<ref>/database/query). Verified: 3 tables
-- created, reason CHECK widened, single-active index present, leaderboard +
-- amb_user_tier now count quiz_score.
-- Idempotent: CREATE TABLE IF NOT EXISTS + CHECK re-ALTER + CREATE OR REPLACE.

-- 1a. Rounds -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.yuvaah_quiz_rounds (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text NOT NULL,
  description           text,
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','active','closed')),
  time_limit_seconds    int  CHECK (time_limit_seconds IS NULL OR time_limit_seconds >= 0),
  points_per_correct    int  NOT NULL DEFAULT 10 CHECK (points_per_correct >= 0),
  questions_per_attempt int  NOT NULL DEFAULT 10 CHECK (questions_per_attempt > 0),
  created_by            uuid REFERENCES public.amb_profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  activated_at          timestamptz,
  closed_at             timestamptz
);
-- At most one active round at a time.
CREATE UNIQUE INDEX IF NOT EXISTS yuvaah_quiz_rounds_one_active_idx
  ON public.yuvaah_quiz_rounds ((status)) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS yuvaah_quiz_rounds_status_idx
  ON public.yuvaah_quiz_rounds (status);
ALTER TABLE public.yuvaah_quiz_rounds ENABLE ROW LEVEL SECURITY;

-- 1b. Questions (pool per round). correct_index is service-role-only. --------
-- Note: column renamed from `prompt` to `question` (2026-06-27).
CREATE TABLE IF NOT EXISTS public.yuvaah_quiz_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id      uuid NOT NULL REFERENCES public.yuvaah_quiz_rounds(id) ON DELETE CASCADE,
  category      text,
  question      text NOT NULL,
  option_a      text NOT NULL,
  option_b      text NOT NULL,
  option_c      text NOT NULL,
  option_d      text NOT NULL,
  correct_index smallint NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS yuvaah_quiz_questions_round_idx
  ON public.yuvaah_quiz_questions (round_id);
ALTER TABLE public.yuvaah_quiz_questions ENABLE ROW LEVEL SECURITY;

-- 1c. Attempts (one per member per round). -----------------------------------
CREATE TABLE IF NOT EXISTS public.yuvaah_quiz_attempts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id              uuid NOT NULL REFERENCES public.yuvaah_quiz_rounds(id) ON DELETE CASCADE,
  profile_id            uuid NOT NULL REFERENCES public.amb_profiles(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'in_progress'
                          CHECK (status IN ('in_progress','completed')),
  assigned_question_ids jsonb NOT NULL,
  answers               jsonb NOT NULL DEFAULT '{}'::jsonb,
  score                 int,
  correct_count         int,
  wrong_count           int,
  unanswered_count      int,
  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  points_ledger_id      uuid REFERENCES public.amb_points_ledger(id) ON DELETE SET NULL,
  UNIQUE (round_id, profile_id)
);
CREATE INDEX IF NOT EXISTS yuvaah_quiz_attempts_round_idx
  ON public.yuvaah_quiz_attempts (round_id);
CREATE INDEX IF NOT EXISTS yuvaah_quiz_attempts_profile_idx
  ON public.yuvaah_quiz_attempts (profile_id);
ALTER TABLE public.yuvaah_quiz_attempts ENABLE ROW LEVEL SECURITY;

-- 2. Ledger reason: allow quiz_score ----------------------------------------
ALTER TABLE public.amb_points_ledger
  DROP CONSTRAINT IF EXISTS amb_points_ledger_reason_check;
ALTER TABLE public.amb_points_ledger
  ADD CONSTRAINT amb_points_ledger_reason_check
  CHECK (reason IN ('submission_awarded','order_redemption','admin_adjustment','award_adjustment','quiz_score'));

-- 3. Leaderboard: count quiz_score as earned (extends 0011). -----------------
CREATE OR REPLACE VIEW public.amb_v_leaderboard AS
SELECT
  p.id          AS user_id,
  p.first_name,
  p.last_name,
  COALESCE(SUM(l.delta), 0)::int AS total_earned
FROM public.amb_profiles p
LEFT JOIN public.amb_points_ledger l
  ON l.user_id = p.id
  AND l.reason IN ('submission_awarded','award_adjustment','quiz_score')
WHERE p.role = 'ambassador' AND p.status = 'approved'
GROUP BY p.id, p.first_name, p.last_name
ORDER BY total_earned DESC;

-- 4. Tier: count quiz_score as earned (extends 0014). ------------------------
-- CREATE OR REPLACE (NOT drop-and-create): the return signature is unchanged
-- from the live function, so replacing in place is safe and avoids any
-- dependency-cascade risk. Verified 2026-06-27: no view/function depends on it.
CREATE OR REPLACE FUNCTION public.amb_user_tier(p_user_id uuid)
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
  SELECT COALESCE(SUM(delta), 0)::int INTO v_earned
    FROM public.amb_points_ledger
   WHERE user_id = p_user_id
     AND reason IN ('submission_awarded', 'award_adjustment', 'quiz_score');

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
