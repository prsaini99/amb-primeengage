-- 0002 · 2026-04-25 · ambassador-platform repo
--
-- Phase 1 §6.2/§6.3 schema: activities, submissions, submission files, points
-- ledger, plus the two views the user dashboard will read for balance and
-- leaderboard. Every object is amb_*-prefixed per HANDOFF rule #2.
--
-- Idempotent: every CREATE uses IF NOT EXISTS / OR REPLACE. Safe to re-run.
-- Already applied to live project zpciertrkqwzuuektzpj on 2026-04-25 via the
-- Supabase Management API. Mirrored into primeengage/supabase/schema.sql so
-- the file-based source of truth stays in sync.
--
-- FK posture (per architecture decision in docs/migration-tasks.md context):
-- every user-pointing FK targets amb_profiles.id (our owned PK), NOT
-- auth.users.id. amb_profiles.id is stable for life; auth_user_id is
-- nullable and gets stitched on approval. This decouples our domain model
-- from Supabase Auth's lifecycle.

------------------------------------------------------------------------------
-- amb_activities (§4.2)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amb_activities (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                text NOT NULL,
  description          text NOT NULL,
  points               int  NOT NULL CHECK (points >= 0),
  submission_deadline  timestamptz NOT NULL,
  cover_image_url      text,
  is_active            boolean NOT NULL DEFAULT true,
  created_by           uuid NOT NULL REFERENCES public.amb_profiles(id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS amb_activities_is_active_idx           ON public.amb_activities (is_active);
CREATE INDEX IF NOT EXISTS amb_activities_submission_deadline_idx ON public.amb_activities (submission_deadline);
CREATE INDEX IF NOT EXISTS amb_activities_created_at_idx          ON public.amb_activities (created_at DESC);
ALTER TABLE public.amb_activities ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------------
-- amb_submissions (§4.3)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amb_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id     uuid NOT NULL REFERENCES public.amb_activities(id) ON DELETE RESTRICT,
  user_id         uuid NOT NULL REFERENCES public.amb_profiles(id)   ON DELETE RESTRICT,
  text_content    text,
  status          text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','awarded')),
  awarded_points  int  CHECK (awarded_points IS NULL OR awarded_points >= 0),
  reviewed_by     uuid REFERENCES public.amb_profiles(id) ON DELETE RESTRICT,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amb_submissions_unique_per_user UNIQUE (activity_id, user_id)
);
CREATE INDEX IF NOT EXISTS amb_submissions_user_id_idx     ON public.amb_submissions (user_id);
CREATE INDEX IF NOT EXISTS amb_submissions_activity_id_idx ON public.amb_submissions (activity_id);
CREATE INDEX IF NOT EXISTS amb_submissions_status_idx      ON public.amb_submissions (status);
CREATE INDEX IF NOT EXISTS amb_submissions_created_at_idx  ON public.amb_submissions (created_at DESC);
ALTER TABLE public.amb_submissions ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------------
-- amb_submission_files (§4.4) — cascade delete with the parent submission
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amb_submission_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.amb_submissions(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  file_type     text NOT NULL,
  file_size     bigint NOT NULL CHECK (file_size > 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS amb_submission_files_submission_id_idx ON public.amb_submission_files (submission_id);
ALTER TABLE public.amb_submission_files ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------------
-- amb_points_ledger (§4.10) — single source of truth for points balance
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amb_points_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.amb_profiles(id) ON DELETE RESTRICT,
  delta        int  NOT NULL,
  reason       text NOT NULL CHECK (reason IN ('submission_awarded','order_redemption','admin_adjustment')),
  reference_id uuid,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS amb_points_ledger_user_id_idx      ON public.amb_points_ledger (user_id);
CREATE INDEX IF NOT EXISTS amb_points_ledger_created_at_idx   ON public.amb_points_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS amb_points_ledger_reference_id_idx ON public.amb_points_ledger (reference_id);
ALTER TABLE public.amb_points_ledger ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------------
-- Views (§4.10)
------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.amb_v_user_balances AS
SELECT user_id, COALESCE(SUM(delta), 0)::int AS balance
FROM public.amb_points_ledger
GROUP BY user_id;

-- Leaderboard ranks ambassadors by total earned (positive deltas only) so
-- that redemptions don't drag a top earner down the list.
CREATE OR REPLACE VIEW public.amb_v_leaderboard AS
SELECT
  p.id          AS user_id,
  p.first_name,
  p.last_name,
  COALESCE(SUM(GREATEST(l.delta, 0)), 0)::int AS total_earned
FROM public.amb_profiles p
LEFT JOIN public.amb_points_ledger l ON l.user_id = p.id
WHERE p.role = 'ambassador' AND p.status = 'approved'
GROUP BY p.id, p.first_name, p.last_name
ORDER BY total_earned DESC;

------------------------------------------------------------------------------
-- Deadline + archive trigger on amb_submissions (§6.2 belt-and-suspenders)
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.amb_submissions_enforce_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_deadline timestamptz;
  v_active   boolean;
BEGIN
  SELECT submission_deadline, is_active
    INTO v_deadline, v_active
    FROM public.amb_activities
    WHERE id = NEW.activity_id;

  IF v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Activity is archived; no new submissions accepted.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOW() > v_deadline THEN
    RAISE EXCEPTION 'Submission window closed (deadline: %).', v_deadline
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS amb_submissions_enforce_window_trg ON public.amb_submissions;
CREATE TRIGGER amb_submissions_enforce_window_trg
BEFORE INSERT ON public.amb_submissions
FOR EACH ROW
EXECUTE FUNCTION public.amb_submissions_enforce_window();

------------------------------------------------------------------------------
-- Storage bucket: amb_activities (public, for activity cover images only)
------------------------------------------------------------------------------
-- §7 caps for admin-controlled images: 5 MB, image/jpeg|png|webp.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'amb_activities',
  'amb_activities',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
