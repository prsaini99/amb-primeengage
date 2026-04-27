import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/orders/[id]/cancel
 * Body: { admin_notes?: string }
 *
 * Calls the Postgres function amb_cancel_order which atomically:
 *   - locks the order
 *   - flips fulfillment_status='cancelled'
 *   - inserts a positive ledger refund (admin_adjustment) if points were
 *     debited at order time
 *   - restores stock if it was decremented
 *
 * Refuses to cancel orders that are already cancelled or already fulfilled.
 */

type SbWithRpc = {
  rpc: (
    fn: "amb_cancel_order",
    args: { p_order_id: string; p_admin_notes: string | null },
  ) => Promise<{ error: { code?: string; message: string } | null }>;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;

    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    let body: { admin_notes?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const notes = body.admin_notes?.trim() || null;

    const sb = createAdminClient();
    const sbRpc = sb as unknown as SbWithRpc;

    const { error: rpcErr } = await sbRpc.rpc("amb_cancel_order", {
      p_order_id: id,
      p_admin_notes: notes,
    });

    if (rpcErr) {
      const msg = rpcErr.message ?? "Cancel failed.";
      const status = msg.includes("not found")
        ? 404
        : msg.includes("already")
          ? 409
          : 500;
      return Response.json({ error: msg }, { status });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin/orders/cancel] uncaught:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
