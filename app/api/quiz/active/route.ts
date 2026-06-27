import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/quiz/active — PUBLIC availability probe for the quiz.
 *
 * Returns only whether a round is currently live (+ its title) so OTHER apps
 * (e.g. the primeengage marketing site, which may be on a different Supabase
 * project) can decide whether to surface a "Take the Quiz" CTA — without ever
 * touching the quiz database directly. No auth, no sensitive data: a boolean
 * and a public round title only.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let active = false;
  let title: string | null = null;
  try {
    const sb = createAdminClient();
    const { data } = await sb
      .from("yuvaah_quiz_rounds")
      .select("id, title")
      .eq("status", "active")
      .maybeSingle();
    active = !!data;
    title = data?.title ?? null;
  } catch {
    // If the DB is briefly unreachable, report "not active" rather than 500 —
    // the marketing CTA fails safe to hidden.
    active = false;
    title = null;
  }

  return Response.json(
    { active, title },
    {
      headers: {
        // Allow cross-origin reads (the marketing site lives on another domain).
        "Access-Control-Allow-Origin": "*",
        // Short edge/browser cache so the marketing page stays light but
        // still flips within ~a minute of activate/deactivate.
        "Cache-Control": "public, max-age=60",
      },
    },
  );
}
