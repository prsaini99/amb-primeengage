-- 0006 · 2026-04-25 · ambassador-platform repo
--
-- §6.5 Events & Gallery — admin-authored content surfaces, no interactions.
-- amb_events: blog-style posts (title + body + cover).
-- amb_gallery: image collection (image + caption).
--
-- created_by FKs target amb_profiles.id (the admin's profile id), consistent
-- with amb_activities. ON DELETE RESTRICT so we can't accidentally orphan
-- content by deleting the admin profile.
--
-- Idempotent: every CREATE uses IF NOT EXISTS / OR REPLACE.
-- Already applied to live project zpciertrkqwzuuektzpj on 2026-04-25 via
-- the Supabase Management API.

------------------------------------------------------------------------------
-- amb_events (§4.5)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amb_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  body            text NOT NULL,
  cover_image_url text,
  created_by      uuid NOT NULL REFERENCES public.amb_profiles(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS amb_events_created_at_idx ON public.amb_events (created_at DESC);
ALTER TABLE public.amb_events ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------------
-- amb_gallery (§4.6)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amb_gallery (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url   text NOT NULL,
  caption     text,
  created_by  uuid NOT NULL REFERENCES public.amb_profiles(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS amb_gallery_created_at_idx ON public.amb_gallery (created_at DESC);
ALTER TABLE public.amb_gallery ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------------
-- Storage buckets — both public, 5 MB image cap per §7
------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'amb_events', 'amb_events', true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'amb_gallery', 'amb_gallery', true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
