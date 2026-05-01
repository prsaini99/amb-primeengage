import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ambassador gate for /dashboard/* pages and /api/dashboard/* route handlers.
 *
 * Mirrors requireAdmin() — the proxy already gates /dashboard/* page routes by
 * role, but route handlers under /api/dashboard/* live in the API tree
 * separately, AND we want a defense-in-depth check inside layouts/pages that
 * also surfaces "your account is not approved" cleanly.
 *
 * Returns:
 *  - userId    : auth.users.id (from JWT)
 *  - profileId : amb_profiles.id (this is what every FK in the schema points
 *                at — submissions.user_id, points_ledger.user_id, etc.)
 *  - profile   : the full amb_profiles row, for rendering header / avatar
 *
 * Status enforcement: only `status = 'approved'` may proceed. Pending /
 * rejected / suspended ambassadors are never expected to reach the dashboard
 * (the approve flow is what creates their auth user), but if they do — e.g.
 * an admin manually flips status='suspended' on a live account — they are
 * redirected to /login with ?error=inactive so the UI can show context.
 *
 * Two flavors:
 *   - requireAmbassador()         → redirect on failure (use in pages/layouts)
 *   - requireAmbassadorForApi()   → return a 401/403 Response on failure
 */

export type AmbassadorContext = {
  userId: string;
  profileId: string;
  profile: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url: string | null;
    status: string;
  };
};

async function resolveAmbassador(): Promise<
  | { ok: true; ctx: AmbassadorContext }
  | { ok: false; reason: "no_session" | "wrong_role" | "no_profile" | "not_approved" }
> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) return { ok: false, reason: "no_session" };

  const role = (user.app_metadata as { role?: string } | null)?.role;
  if (role !== "ambassador") return { ok: false, reason: "wrong_role" };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("amb_profiles")
    .select("id, first_name, last_name, email, avatar_url, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) return { ok: false, reason: "no_profile" };
  if (profile.status !== "approved") return { ok: false, reason: "not_approved" };

  return {
    ok: true,
    ctx: { userId: user.id, profileId: profile.id, profile },
  };
}

/** For pages and layouts. Redirects on failure; never returns on failure. */
export async function requireAmbassador(): Promise<AmbassadorContext> {
  const r = await resolveAmbassador();
  if (r.ok) return r.ctx;

  if (r.reason === "no_session") redirect("/login");
  if (r.reason === "wrong_role") redirect("/admin/applications");
  // not_approved or no_profile — explain via query param so /login can show it
  redirect("/login?error=inactive");
}

/** For Route Handlers. Returns a Response to short-circuit with on failure. */
export type RequireAmbassadorApiResult =
  | { ok: true; ctx: AmbassadorContext }
  | { ok: false; response: Response };

export async function requireAmbassadorForApi(): Promise<RequireAmbassadorApiResult> {
  const r = await resolveAmbassador();
  if (r.ok) return { ok: true, ctx: r.ctx };

  if (r.reason === "no_session") {
    return {
      ok: false,
      response: Response.json({ error: "Not signed in." }, { status: 401 }),
    };
  }
  if (r.reason === "wrong_role") {
    return {
      ok: false,
      response: Response.json(
        { error: "Yuvaah Club role required." },
        { status: 403 },
      ),
    };
  }
  return {
    ok: false,
    response: Response.json(
      { error: "Account is not active." },
      { status: 403 },
    ),
  };
}
