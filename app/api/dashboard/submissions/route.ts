import { requireAmbassadorForApi } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/dashboard/submissions
 *
 * Commits a submission. Inputs: { activity_id, text_content? }
 *
 * Both notes and files are optional — a bare submit registers
 * participation. (File uploads were removed per client request; the
 * amb_submission_files table stays for historical submissions.)
 *
 * The deadline + archive trigger on amb_submissions provides DB-level
 * enforcement, so a slow request that crosses the deadline mid-flight
 * still gets rejected at insert time.
 *
 * Idempotency: UNIQUE(activity_id, user_id). A double-submit returns 409.
 */
export async function POST(req: Request) {
  const gate = await requireAmbassadorForApi();
  if (!gate.ok) return gate.response;

  let body: { activity_id?: string; text_content?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const activityId = body.activity_id;
  const text = (body.text_content ?? "").trim();

  if (!activityId || typeof activityId !== "string") {
    return Response.json({ error: "activity_id is required." }, { status: 400 });
  }

  const sb = createAdminClient();

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

  return Response.json({ ok: true, submission_id: submission.id });
}
