-- 0001 · 2026-04-25 · ambassador-platform repo
--
-- Add `rejected_at` to amb_profiles so the rejection flow can record when an
-- applicant was turned down (mirror of approved_at). Required by the Phase 1
-- /api/admin/applications/[id]/reject route handler.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is safe to re-run.
-- Already applied to live project zpciertrkqwzuuektzpj on 2026-04-25 via the
-- Supabase Management API. Mirrored into primeengage/supabase/schema.sql so
-- the file-based source of truth stays in sync.

ALTER TABLE public.amb_profiles
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
