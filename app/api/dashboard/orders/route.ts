import { requireAmbassadorForApi } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/dashboard/orders
 * Body: { product_id: string }
 *
 * Calls the Postgres function amb_create_order which atomically:
 *   - locks the product
 *   - validates active + in-stock + Phase 2 pure-points + balance
 *   - inserts the order
 *   - debits the ledger
 *   - decrements stock
 *
 * Returns the new order id.
 */

// Phase 1 typegen pattern: cast the *client* (not the extracted method) so
// `this` is preserved inside the supabase-js rpc implementation.
type SbWithRpc = {
  rpc: (
    fn: "amb_create_order",
    args: { p_user_id: string; p_product_id: string },
  ) => Promise<{ data: string | null; error: { code?: string; message: string } | null }>;
};

export async function POST(req: Request) {
  try {
    const gate = await requireAmbassadorForApi();
    if (!gate.ok) return gate.response;

    let body: { product_id?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const productId = body.product_id?.trim();
    if (!productId) {
      return Response.json({ error: "product_id is required." }, { status: 400 });
    }

    const sb = createAdminClient();
    const sbRpc = sb as unknown as SbWithRpc;

    const { data: orderId, error: rpcErr } = await sbRpc.rpc(
      "amb_create_order",
      { p_user_id: gate.ctx.profileId, p_product_id: productId },
    );

    if (rpcErr) {
      const msg = rpcErr.message ?? "Order failed.";
      const status = msg.includes("not found")
        ? 404
        : msg.includes("Insufficient balance") ||
            msg.includes("Out of stock") ||
            msg.includes("archived") ||
            msg.includes("Money payments")
          ? 409
          : 500;
      return Response.json({ error: msg }, { status });
    }

    return Response.json({ ok: true, order_id: orderId });
  } catch (err) {
    console.error("[dashboard/orders] uncaught:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
