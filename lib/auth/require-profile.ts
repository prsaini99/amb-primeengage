import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/auth/roles";

/**
 * Mutual gate for routes that BOTH admin and ambassador can hit (chat is
 * the first such feature). Returns the caller's amb_profiles.id and role.
 *
 * Mirrors requireAdmin / requireAmbassador failure modes:
 *  - 401 if no session
 *  - 403 if no profile or role isn't recognized
 *  - 403 if ambassador's status isn't 'approved'
 */
export type ProfileContext = {
  userId: string;
  profileId: string;
  role: Role;
};

export type RequireProfileResult =
  | { ok: true; ctx: ProfileContext }
  | { ok: false; response: Response };

export async function requireProfileForApi(): Promise<RequireProfileResult> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Not signed in." }, { status: 401 }),
    };
  }

  const role = (user.app_metadata as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "ambassador") {
    return {
      ok: false,
      response: Response.json(
        { error: "No recognized role on this account." },
        { status: 403 },
      ),
    };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("amb_profiles")
    .select("id, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return {
      ok: false,
      response: Response.json(
        { error: "Profile missing." },
        { status: 403 },
      ),
    };
  }

  // Ambassadors must be approved to interact. Admins always pass status.
  if (role === "ambassador" && profile.status !== "approved") {
    return {
      ok: false,
      response: Response.json(
        { error: "Account is not active." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    ctx: { userId: user.id, profileId: profile.id, role },
  };
}
