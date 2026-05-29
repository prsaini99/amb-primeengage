import { randomBytes } from "node:crypto";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendApprovalEmail } from "@/lib/mailer";
import { generateUniqueReferralCode } from "@/lib/referral";

/**
 * POST /api/admin/applications/[id]/approve
 *
 * Flow:
 *   1. Admin gate (defense-in-depth — proxy gates /admin/* but /api/admin/*
 *      lives in the API tree separately).
 *   2. Read the profile, validate status='pending' AND role='ambassador'.
 *   3. Generate a 16-char base64url password.
 *   4. Create the auth user with email_confirm: true and
 *      app_metadata.role: 'ambassador'.
 *   5. Update amb_profiles: link auth_user_id, set status='approved',
 *      approved_at=NOW().
 *   6. Send the approval email with credentials.
 *   7. If email send fails, roll back (delete the auth user, reset profile
 *      to pending) so admin can retry. The plaintext password lives in
 *      memory only — never stored, never logged.
 */
function generatePassword() {
  return randomBytes(12)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const sb = createAdminClient();

  // Read + validate the profile.
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
      { error: "Only Yuvaah Club applications can be approved." },
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

  // Create the auth user.
  const password = generatePassword();
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: profile.email,
    password,
    email_confirm: true,
    app_metadata: { role: "ambassador" },
    user_metadata: { name: profile.first_name },
  });
  if (createErr || !created?.user) {
    return Response.json(
      {
        error: `Could not create auth user: ${createErr?.message ?? "unknown"}`,
      },
      { status: 500 },
    );
  }
  const authUserId = created.user.id;

  // Generate the member's unique referral code. If generation somehow fails
  // (all attempts collided — practically impossible), leave it null; the
  // admin can set one later from the application detail page. We never fail
  // an approval over code generation.
  const referralCode = await generateUniqueReferralCode(sb);

  // Link + flip status + assign referral code. If this fails, roll back the
  // auth user.
  const { error: updateErr } = await sb
    .from("amb_profiles")
    .update({
      auth_user_id: authUserId,
      status: "approved",
      approved_at: new Date().toISOString(),
      referral_code: referralCode,
    })
    .eq("id", id);
  if (updateErr) {
    await sb.auth.admin.deleteUser(authUserId);
    return Response.json(
      { error: `Profile update failed; rolled back: ${updateErr.message}` },
      { status: 500 },
    );
  }

  // Send the email. If it fails, roll back so admin can retry cleanly —
  // we never want an "approved" user with no way to receive credentials.
  try {
    await sendApprovalEmail({
      first_name: profile.first_name,
      email: profile.email,
      password,
    });
  } catch (mailErr) {
    await sb
      .from("amb_profiles")
      .update({
        auth_user_id: null,
        status: "pending",
        approved_at: null,
        referral_code: null,
      })
      .eq("id", id);
    await sb.auth.admin.deleteUser(authUserId);
    return Response.json(
      {
        error: `Approval email failed; rolled back. Retry once SMTP is back. (${mailErr instanceof Error ? mailErr.message : String(mailErr)})`,
      },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, auth_user_id: authUserId });
}
