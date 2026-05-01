import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendRejectionEmail } from "@/lib/mailer";

/**
 * POST /api/admin/applications/[id]/reject
 *
 * Flow:
 *   1. Admin gate.
 *   2. Read the profile, validate status='pending'.
 *   3. Update amb_profiles: status='rejected', rejected_at=NOW().
 *   4. Send the rejection email.
 *
 * Email failure here is logged in the response but does NOT roll back —
 * unlike approval (which would leave a credential-less user). A rejection
 * is just a status change; admin can re-trigger the email later if needed.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const sb = createAdminClient();

  const { data: profile, error: readErr } = await sb
    .from("amb_profiles")
    .select("id, role, status, first_name, email")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    return Response.json(
      { error: `Failed to read profile: ${readErr.message}` },
      { status: 500 },
    );
  }
  if (!profile) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }
  if (profile.role !== "ambassador") {
    return Response.json(
      { error: "Only Yuvaah Club applications can be rejected." },
      { status: 422 },
    );
  }
  if (profile.status !== "pending") {
    return Response.json(
      {
        error: `Application is ${profile.status}, not pending. No action taken.`,
      },
      { status: 409 },
    );
  }

  const { error: updateErr } = await sb
    .from("amb_profiles")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateErr) {
    return Response.json(
      { error: `Profile update failed: ${updateErr.message}` },
      { status: 500 },
    );
  }

  // Email is best-effort. If SMTP is down, the rejection still stands —
  // admin can re-send manually. Surface a soft warning either way.
  let emailWarning: string | null = null;
  try {
    await sendRejectionEmail({
      first_name: profile.first_name,
      email: profile.email,
    });
  } catch (mailErr) {
    emailWarning = `Status updated, but rejection email failed: ${
      mailErr instanceof Error ? mailErr.message : String(mailErr)
    }`;
  }

  return Response.json({ ok: true, ...(emailWarning ? { warning: emailWarning } : {}) });
}
