-- 0003 · 2026-04-25 · ambassador-platform repo
--
-- Storage bucket for ambassador submission uploads (§7 of tech doc).
-- Private — admin generates signed URLs to view; ambassadors upload via
-- signed-upload URLs minted by /api/dashboard/submissions/sign-upload.
--
-- Bucket-level file_size_limit is the *upper bound* (50 MB, the highest of
-- the per-type caps in §7). Per-file caps by MIME (image ≤5MB, video ≤50MB,
-- doc ≤10MB) are enforced application-side in the route handler before the
-- signed-upload URL is issued.
--
-- Idempotent: re-running on existing bucket is a no-op.
-- Already applied to live project zpciertrkqwzuuektzpj on 2026-04-25 via
-- the Supabase Management API.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'amb_submissions',
  'amb_submissions',
  false,
  52428800, -- 50 MB
  ARRAY[
    -- images
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    -- videos
    'video/mp4', 'video/quicktime', 'video/webm',
    -- documents
    'application/pdf',
    -- archives (Windows / older browsers send the x-zip-compressed variant)
    'application/zip', 'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
