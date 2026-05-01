import { requireAmbassadorForApi } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPaymentSignature } from "@/lib/razorpay";

/**
 * POST /api/dashboard/orders/payment-verify
 * Body: {
 *   order_id: string,                  // OUR amb_orders.id
 *   razorpay_order_id: string,
 *   razorpay_payment_id: string,
 *   razorpay_signature: string,
 * }
 *
 * Called from the Razorpay checkout's `handler` callback after a successful
 * payment. We:
 *   1. Verify the signature with our key_secret (server-only).
 *   2. Confirm the order belongs to the caller.
 *   3. Call amb_finalize_paid_order RPC: marks paid, debits ledger,
 *      decrements stock — atomic.
 */

type SbWithRpc = {
  rpc: (
    fn: "amb_finalize_paid_order",
    args: { p_order_id: string; p_payment_ref: string },
  ) => Promise<{ error: { code?: string; message: string } | null }>;
};

export async function POST(req: Request) {
  try {
    const gate = await requireAmbassadorForApi();
    if (!gate.ok) return gate.response;

    let body: {
      order_id?: string;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const orderId = body.order_id?.trim();
    const rzpOrderId = body.razorpay_order_id?.trim();
    const rzpPaymentId = body.razorpay_payment_id?.trim();
    const rzpSignature = body.razorpay_signature?.trim();

    if (!orderId || !rzpOrderId || !rzpPaymentId || !rzpSignature) {
      return Response.json(
        {
          error:
            "order_id, razorpay_order_id, razorpay_payment_id, and razorpay_signature are all required.",
        },
        { status: 400 },
      );
    }

    if (!verifyPaymentSignature(rzpOrderId, rzpPaymentId, rzpSignature)) {
      return Response.json(
        { error: "Payment signature is invalid." },
        { status: 400 },
      );
    }

    const sb = createAdminClient();

    // Confirm the order is the caller's. Defense-in-depth — even with a
    // valid Razorpay signature, we won't finalize someone else's order.
    const { data: order, error: readErr } = await sb
      .from("amb_orders")
      .select("id, user_id, payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (readErr) return Response.json({ error: readErr.message }, { status: 500 });
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    if (order.user_id !== gate.ctx.profileId) {
      return Response.json(
        { error: "This order does not belong to you." },
        { status: 403 },
      );
    }

    const sbRpc = sb as unknown as SbWithRpc;
    const { error: rpcErr } = await sbRpc.rpc("amb_finalize_paid_order", {
      p_order_id: orderId,
      p_payment_ref: rzpPaymentId,
    });

    if (rpcErr) {
      const msg = rpcErr.message ?? "Failed to finalize.";
      const status = msg.includes("not awaiting payment")
        ? 409
        : msg.includes("not found")
          ? 404
          : msg.includes("refund")
            ? 422
            : 500;
      return Response.json({ error: msg }, { status });
    }

    return Response.json({ ok: true, order_id: orderId });
  } catch (err) {
    console.error("[payment-verify] uncaught:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
