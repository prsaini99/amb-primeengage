import { randomUUID } from "node:crypto";

import { requireAmbassadorForApi } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/dashboard/submissions/sign-upload
 *
 * Mints one signed-upload URL per file, scoped to a path under
 *   amb_submissions/<user_id>/<temp_id>/<filename>
 *
 * The temp_id stays the same across all files in one submission so the
 * commit handler can verify all paths belong to the same upload batch.
 *
 * Server-side validation here is the gate that decides whether the upload
 * can begin at all:
 *   - ambassador session
 *   - activity exists, active, deadline future
 *   - no existing submission (UNIQUE(activity_id, user_id) would catch it on
 *     commit, but we surface it here so the user doesn't waste an upload)
 *   - per-file: MIME whitelist + per-MIME size cap (image ≤5MB, video ≤50MB,
 *     doc ≤10MB) per tech doc §7
 *
 * Returns:
 *   { temp_id, uploads: [{ name, path, signedUploadUrl, token }] }
 */
const BUCKET = "amb_submissions";

const MIME_LIMITS: Record<string, number> = {
  // images — 5 MB
  "image/jpeg": 5 * 1024 * 1024,
  "image/png":  5 * 1024 * 1024,
  "image/webp": 5 * 1024 * 1024,
  "image/gif":  5 * 1024 * 1024,
  // videos — 50 MB
  "video/mp4":       50 * 1024 * 1024,
  "video/quicktime": 50 * 1024 * 1024,
  "video/webm":      50 * 1024 * 1024,
  // documents — 10 MB
  "application/pdf": 10 * 1024 * 1024,
  // archives — 50 MB. Two MIME forms because Windows / older browsers send
  // application/x-zip-compressed instead of the standard application/zip.
  "application/zip":               50 * 1024 * 1024,
  "application/x-zip-compressed":  50 * 1024 * 1024,
};

const MAX_FILES_PER_SUBMISSION = 10;

type RequestedFile = { name: string; type: string; size: number };

export async function POST(req: Request) {
  const gate = await requireAmbassadorForApi();
  if (!gate.ok) return gate.response;

  let body: { activity_id?: string; files?: RequestedFile[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const activityId = body.activity_id;
  const files = body.files ?? [];

  if (!activityId || typeof activityId !== "string") {
    return Response.json({ error: "activity_id is required." }, { status: 400 });
  }
  if (!Array.isArray(files) || files.length === 0) {
    return Response.json(
      { error: "At least one file is required." },
      { status: 400 },
    );
  }
  if (files.length > MAX_FILES_PER_SUBMISSION) {
    return Response.json(
      { error: `Max ${MAX_FILES_PER_SUBMISSION} files per submission.` },
      { status: 400 },
    );
  }

  // Per-file gate.
  for (const f of files) {
    if (!f?.name || typeof f.name !== "string") {
      return Response.json({ error: "Each file needs a name." }, { status: 400 });
    }
    const cap = MIME_LIMITS[f.type];
    if (cap === undefined) {
      return Response.json(
        { error: `Unsupported file type: ${f.type || "unknown"}.` },
        { status: 415 },
      );
    }
    if (typeof f.size !== "number" || f.size <= 0) {
      return Response.json(
        { error: `Invalid file size for ${f.name}.` },
        { status: 400 },
      );
    }
    if (f.size > cap) {
      return Response.json(
        {
          error: `${f.name} is too large for type ${f.type} (max ${(cap / 1024 / 1024) | 0} MB).`,
        },
        { status: 413 },
      );
    }
  }

  const sb = createAdminClient();

  // Activity must exist, be active, and have a future deadline.
  const { data: activity, error: actErr } = await sb
    .from("amb_activities")
    .select("id, is_active, submission_deadline")
    .eq("id", activityId)
    .maybeSingle();
  if (actErr) {
    return Response.json({ error: actErr.message }, { status: 500 });
  }
  if (!activity) {
    return Response.json({ error: "Activity not found." }, { status: 404 });
  }
  if (!activity.is_active) {
    return Response.json(
      { error: "Activity is archived." },
      { status: 409 },
    );
  }
  if (new Date(activity.submission_deadline).getTime() <= Date.now()) {
    return Response.json(
      { error: "Submission deadline has passed." },
      { status: 409 },
    );
  }

  // No prior submission allowed — UNIQUE(activity_id, user_id) at the DB
  // level guarantees this, but checking up front avoids wasted uploads.
  const { data: existing } = await sb
    .from("amb_submissions")
    .select("id")
    .eq("activity_id", activityId)
    .eq("user_id", gate.ctx.profileId)
    .maybeSingle();
  if (existing) {
    return Response.json(
      { error: "You have already submitted for this activity." },
      { status: 409 },
    );
  }

  // Mint signed-upload URLs.
  const tempId = randomUUID();
  const uploads = [];
  for (const f of files) {
    const safeName = sanitizeFilename(f.name);
    const path = `${gate.ctx.profileId}/${tempId}/${safeName}`;
    const { data: signed, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (signErr || !signed) {
      return Response.json(
        { error: `Could not sign upload for ${f.name}: ${signErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    uploads.push({
      name: f.name,
      path,
      signedUploadUrl: signed.signedUrl,
      token: signed.token,
    });
  }

  return Response.json({ temp_id: tempId, uploads });
}

/**
 * Strip path traversal + control chars; collapse to a sane filename. The path
 * is owned by us (we prefix profile_id + temp_id), but the filename is
 * user-supplied so we sanitize before joining.
 */
function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  return base
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "file";
}
