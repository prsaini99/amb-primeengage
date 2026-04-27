import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/submissions/[id]/adjust-award
 *
 * Body: { points: number }
 *
 * Adjusts the awarded points on an already-awarded submission. Append-only
 * via the ledger (a new amb_points_ledger row with reason='admin_adjustment'
 * for the delta). The Postgres function `amb_adjust_award_submission`
 * handles the row-lock, the delta math, and the no-op case.
 *
 * No notification email — Phase 1 keeps adjustments quiet on the assumption
 * that the dashboard balance card is the source of truth for the
 * ambassador. If anyone wants email notifications on adjustments, swap the
 * route to call sendAwardEmail (or a sendAwardAdjustmentEmail variant).
 */

// Same typing escape hatch as /award — Phase 1 typegen doesn't surface
// Postgres functions in Database['Functions']. Cast the client (not the
// extracted method) so `this` is preserved.
type SbWithRpc = {
  rpc: (
    fn: "amb_adjust_award_submission",
    args: { p_submission_id: string; p_new_points: number; p_reviewer_id: string },
  ) => Promise<{ error: { code?: string; message: string } | null }>;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    return await handleAdjust(req, ctx);
  } catch (err) {
    console.error("[adjust-award] uncaught:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

async function handleAdjust(
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

  const { error: rpcErr } = await sbRpc.rpc("amb_adjust_award_submission", {
    p_submission_id: id,
    p_new_points: points,
    p_reviewer_id: gate.profileId,
  });

  if (rpcErr) {
    const msg = rpcErr.message ?? "Adjustment failed.";
    const status = msg.includes("not found")
      ? 404
      : msg.includes("Only awarded")
        ? 409
        : msg.includes("Points must")
          ? 400
          : 500;
    return Response.json({ error: msg }, { status });
  }

  return Response.json({ ok: true, awarded_points: points });
}
