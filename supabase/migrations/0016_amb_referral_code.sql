-- 0016 · 2026-05-29 · ambassador-platform repo
--
-- Per-Yuvaah referral code. Each approved Yuvaah Club member gets a unique
-- code (auto-generated at approval time, admin-editable afterward). This is
-- the member's OWN code to share — distinct from
-- amb_profiles.application_data.referral_code, which records the code an
-- applicant entered when applying (i.e. who referred them).
--
-- Nullable: pending/rejected profiles have no code, and existing approved
-- members start NULL so the admin can enter the exact codes already handed
-- out by hand. Uniqueness is case-insensitive via a unique index on
-- upper(referral_code); NULLs are exempt (multiple allowed).
--
-- Idempotent (ADD COLUMN IF NOT EXISTS, CREATE UNIQUE INDEX IF NOT EXISTS).

ALTER TABLE public.amb_profiles
  ADD COLUMN IF NOT EXISTS referral_code text;

CREATE UNIQUE INDEX IF NOT EXISTS amb_profiles_referral_code_unique_idx
  ON public.amb_profiles (upper(referral_code));
