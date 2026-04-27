import { requireAmbassadorForApi } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/dashboard/submissions
 *
 * Commits a submission after files have been PUT to their signed-upload URLs.
 * Inputs:
 *   { activity_id, text_content?, files: [{ path, type, size }] }
 *
 * Validation:
 *   - ambassador session
 *   - all file paths begin with `<ambassador.profileId>/` (defense in depth —
 *     the sign-upload handler already constrained this, but we re-check)
 *   - at least one file OR non-empty text_content
 *   - actual file existence in the bucket (sanity-check that the PUT succeeded)
 *
 * The deadline + archive trigger on amb_submissions provides DB-level
 * belt-and-suspenders, so a slow request that crosses the deadline mid-flight
 * still gets rejected at insert time.
 *
 * Idempotency: UNIQUE(activity_id, user_id). A double-submit returns 409.
 */
type CommitFile = { path: string; type: string; size: number };

export async function POST(req: Request) {
  const gate = await requireAmbassadorForApi();
  if (!gate.ok) return gate.response;

  let body: { activity_id?: string; text_content?: string; files?: CommitFile[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const activityId = body.activity_id;
  const text = (body.text_content ?? "").trim();
  const files = body.files ?? [];

  if (!activityId || typeof activityId !== "string") {
    return Response.json({ error: "activity_id is required." }, { status: 400 });
  }
  if (!Array.isArray(files)) {
    return Response.json({ error: "files must be an array." }, { status: 400 });
  }
  if (files.length === 0 && !text) {
    return Response.json(
      { error: "Add at least one file or some text before submitting." },
      { status: 400 },
    );
  }

  // Each path must live under this user's prefix — protects against a client
  // hand-crafting a path under another ambassador's prefix after intercepting
  // the sign-upload response.
  const expectedPrefix = `${gate.ctx.profileId}/`;
  for (const f of files) {
    if (
      !f?.path ||
      typeof f.path !== "string" ||
      !f.path.startsWith(expectedPrefix)
    ) {
      return Response.json(
        { error: "File path does not belong to your account." },
        { status: 403 },
      );
    }
    if (typeof f.size !== "number" || f.size <= 0) {
      return Response.json({ error: "Invalid file size." }, { status: 400 });
    }
    if (typeof f.type !== "string" || !f.type) {
      return Response.json({ error: "Invalid file type." }, { status: 400 });
    }
  }

  const sb = createAdminClient();

  // Sanity-check that the upload actually landed (the client could lie about
  // the path). storage.from().list() is cheap; one per file.
  for (const f of files) {
    const lastSlash = f.path.lastIndexOf("/");
    const folder = f.path.slice(0, lastSlash);
    const filename = f.path.slice(lastSlash + 1);
    const { data: listed } = await sb.storage
      .from("amb_submissions")
      .list(folder, { limit: 100, search: filename });
    const exists = listed?.some((o) => o.name === filename);
    if (!exists) {
      return Response.json(
        { error: `Upload missing for ${filename}. Please try again.` },
        { status: 400 },
      );
    }
  }

  // Insert submission. The trigger enforces deadline + is_active.
  const { data: submission, error: insertErr } = await sb
    .from("amb_submissions")
    .insert({
      activity_id: activityId,
      user_id: gate.ctx.profileId,
      text_content: text || null,
    })
    .select("id")
    .single();

  if (insertErr || !submission) {
    // 23505 = unique_violation; check_violation is what the trigger raises.
    const code = (insertErr as { code?: string } | null)?.code;
    if (code === "23505") {
      return Response.json(
        { error: "You have already submitted for this activity." },
        { status: 409 },
      );
    }
    return Response.json(
      { error: insertErr?.message ?? "Submission failed." },
      { status: 500 },
    );
  }

  // Insert file rows. If this fails, roll back the submission row so the user
  // can retry cleanly (and orphan files in storage are sweepable later).
  if (files.length > 0) {
    const fileRows = files.map((f) => ({
      submission_id: submission.id,
      storage_path: f.path,
      file_type: f.type,
      file_size: f.size,
    }));
    const { error: filesErr } = await sb
      .from("amb_submission_files")
      .insert(fileRows);
    if (filesErr) {
      await sb.from("amb_submissions").delete().eq("id", submission.id);
      return Response.json(
        { error: `Could not record files: ${filesErr.message}` },
        { status: 500 },
      );
    }
  }

  return Response.json({ ok: true, submission_id: submission.id });
}
