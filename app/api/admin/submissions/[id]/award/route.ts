import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAwardEmail } from "@/lib/mailer";

/**
 * POST /api/admin/submissions/[id]/award
 *
 * Body: { points: number }
 *
 * Atomicity is enforced inside the Postgres function `amb_award_submission`
 * (see supabase/migrations/0004_amb_award_submission_fn.sql) — it
 * SELECT-FOR-UPDATEs the submission row, refuses re-awards, and inserts the
 * ledger entry in the same transaction.
 *
 * Email is best-effort: if SMTP fails the award stands and a warning is
 * surfaced in the response. The data is correct either way; admin can
 * resend manually if needed.
 */

// Phase 1 typegen doesn't surface Postgres functions in Database['Functions'],
// so the generic .rpc("name", args) call would type-error. Cast the *client*
// (not the extracted method) so `this` is preserved when we call .rpc on it —
// extracting the method as a free variable drops `this` and crashes inside
// the Supabase client. TODO: extend scripts/generate-types.mjs to emit
// Functions metadata so this cast can disappear.
type SbWithRpc = {
  rpc: (
    fn: "amb_award_submission",
    args: { p_submission_id: string; p_points: number; p_reviewer_id: string },
  ) => Promise<{ error: { code?: string; message: string } | null }>;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    return await handleAward(req, ctx);
  } catch (err) {
    // Last-resort guard: if anything throws after we've started building the
    // response, surface a JSON body so the client doesn't choke parsing an
    // empty 500. The original error is logged to the server console.
    console.error("[award] uncaught:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

async function handleAward(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { points?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const points = Number(body.points);
  if (!Number.isInteger(points) || points < 0 || points > 100000) {
    return Response.json(
      { error: "Points must be a whole number between 0 and 100,000." },
      { status: 400 },
    );
  }

  const sb = createAdminClient();
  const sbRpc = sb as unknown as SbWithRpc;

  const { error: rpcErr } = await sbRpc.rpc("amb_award_submission", {
    p_submission_id: id,
    p_points: points,
    p_reviewer_id: gate.profileId,
  });

  if (rpcErr) {
    // Map the function's RAISE EXCEPTION variants to useful HTTP statuses.
    const msg = rpcErr.message ?? "Award failed.";
    const status = msg.includes("not found")
      ? 404
      : msg.includes("already")
        ? 409
        : msg.includes("Points must")
          ? 400
          : 500;
    return Response.json({ error: msg }, { status });
  }

  // Pull what we need for the notification email + the response body.
  // Three small queries in parallel — separate from the embedded-resource
  // pattern because the Phase 1 typegen doesn't carry FK Relationships.
  const submissionPromise = sb
    .from("amb_submissions")
    .select("user_id, activity_id, awarded_points")
    .eq("id", id)
    .maybeSingle();

  const { data: sub } = await submissionPromise;
  let emailWarning: string | null = null;

  if (sub && sub.user_id && sub.activity_id && points > 0) {
    const [{ data: activity }, { data: profile }, { data: bal }] =
      await Promise.all([
        sb.from("amb_activities").select("title").eq("id", sub.activity_id).maybeSingle(),
        sb.from("amb_profiles").select("first_name, email").eq("id", sub.user_id).maybeSingle(),
        sb.from("amb_v_user_balances").select("balance").eq("user_id", sub.user_id).maybeSingle(),
      ]);

    if (activity && profile) {
      try {
        await sendAwardEmail({
          first_name: profile.first_name,
          email: profile.email,
          activity_title: activity.title,
          points,
          total_balance: bal?.balance ?? points,
        });
      } catch (err) {
        emailWarning = `Award recorded but notification email failed: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    }
  }

  return Response.json({
    ok: true,
    awarded_points: points,
    ...(emailWarning ? { warning: emailWarning } : {}),
  });
}
