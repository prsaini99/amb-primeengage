import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Defense-in-depth admin gate for Route Handlers under /api/admin/* and for
 * Server Actions that mutate admin-owned tables.
 *
 * The proxy already gates /admin/* page routes, but /api/admin/* lives in
 * the API tree and is matched separately. Always call this at the top of
 * any /api/admin/* handler or activity/submission Server Action.
 *
 * Returns:
 *  - userId    : auth.users.id of the signed-in admin (from the JWT)
 *  - profileId : amb_profiles.id of the signed-in admin — every "created_by"
 *                / "reviewed_by" / "user_id" FK in this schema points here,
 *                NOT at auth.users.id. The lookup is one indexed query.
 *
 * Failure modes:
 *  - 401 "Not signed in."        — no session
 *  - 403 "Admin role required."  — JWT app_metadata.role != 'admin'
 *  - 403 "Admin profile missing."— role=admin but no amb_profiles row
 *                                  (only happens if the admin row was
 *                                  manually deleted; surfaces as a clear
 *                                  error rather than a silent FK violation)
 */
export type RequireAdminResult =
  | { ok: true; userId: string; profileId: string }
  | { ok: false; response: Response };

export async function requireAdmin(): Promise<RequireAdminResult> {
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
  if (role !== "admin") {
    return {
      ok: false,
      response: Response.json(
        { error: "Admin role required." },
        { status: 403 },
      ),
    };
  }

  // Resolve the admin's amb_profiles.id. Service-role bypass is necessary
  // because amb_profiles has RLS enabled with no SELECT policy yet.
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("amb_profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error || !profile) {
    return {
      ok: false,
      response: Response.json(
        { error: "Admin profile missing." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, userId: user.id, profileId: profile.id };
}
