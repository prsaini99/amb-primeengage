import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/orders/[id]/fulfill
 * Body: { admin_notes?: string }
 *
 * Marks an order fulfilled. admin_notes carries voucher codes / tracking
 * numbers / etc. — what the ambassador sees for confirmation. Idempotent
 * by guard: refuses to re-fulfill or fulfill an already-cancelled order.
 *
 * No RPC needed — single UPDATE, no ledger writes (no points change at
 * fulfillment time; the debit happened at order creation).
 */
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
    const { data: existing, error: readErr } = await sb
      .from("amb_orders")
      .select("id, fulfillment_status")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return Response.json({ error: readErr.message }, { status: 500 });
    if (!existing) return Response.json({ error: "Order not found." }, { status: 404 });
    if (existing.fulfillment_status === "fulfilled") {
      return Response.json(
        { error: "Order is already fulfilled." },
        { status: 409 },
      );
    }
    if (existing.fulfillment_status === "cancelled") {
      return Response.json(
        { error: "Cancelled orders cannot be fulfilled. Create a new order instead." },
        { status: 409 },
      );
    }

    const { error: updErr } = await sb
      .from("amb_orders")
      .update({ fulfillment_status: "fulfilled", admin_notes: notes })
      .eq("id", id);
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin/orders/fulfill] uncaught:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
