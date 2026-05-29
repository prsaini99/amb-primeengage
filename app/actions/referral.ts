"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReferralResult = { ok: false; error: string } | { ok: true };

// Lenient on purpose: the admin is also entering codes handed out by hand
// before this feature existed, which may not match the auto-generated style.
// Uppercased + trimmed; letters, digits, hyphen, underscore; 3–32 chars.
const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

/**
 * Set (or change) a Yuvaah's referral code. Admin-only. Pass an empty string
 * to clear the code. Uniqueness is enforced case-insensitively, excluding
 * the member's own row.
 */
export async function setReferralCode(
  profileId: string,
  rawCode: string,
): Promise<ReferralResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const code = rawCode.trim().toUpperCase();
  const sb = createAdminClient();

  // Empty → clear the code.
  if (code === "") {
    const { error } = await sb
      .from("amb_profiles")
      .update({ referral_code: null })
      .eq("id", profileId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/applications");
    revalidatePath(`/admin/applications/${profileId}`);
    return { ok: true };
  }

  if (!CODE_RE.test(code)) {
    return {
      ok: false,
      error:
        "Code must be 3–32 characters: letters, digits, hyphen or underscore.",
    };
  }

  // Uniqueness check (case-insensitive), excluding this profile.
  const { data: clash } = await sb
    .from("amb_profiles")
    .select("id")
    .ilike("referral_code", code)
    .neq("id", profileId)
    .maybeSingle();
  if (clash) {
    return { ok: false, error: `Code "${code}" is already in use by another member.` };
  }

  const { error } = await sb
    .from("amb_profiles")
    .update({ referral_code: code })
    .eq("id", profileId);
  if (error) {
    // 23505 = unique_violation (lost a race against a concurrent write).
    const dbCode = (error as { code?: string }).code;
    if (dbCode === "23505") {
      return { ok: false, error: `Code "${code}" was just taken. Try another.` };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${profileId}`);
  return { ok: true };
}
