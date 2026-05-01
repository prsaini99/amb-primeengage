import { requireAmbassadorForApi } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";
import { razorpay } from "@/lib/razorpay";

/**
 * POST /api/dashboard/orders/payment-init
 * Body: { product_id: string }
 *
 * For hybrid redemptions (ambassador is short on points). Flow:
 *   1. Compute the shortfall server-side (never trust client math).
 *   2. Call amb_init_paid_order to create a 'pending' order — points are
 *      reserved logically but not yet debited; stock not yet decremented.
 *   3. Create a Razorpay order for the INR shortfall.
 *   4. Return everything the client checkout needs to open the modal.
 *
 * If the Razorpay create fails after our DB order succeeded, we cancel the
 * DB order to avoid orphaning a 'pending' row.
 *
 * Pure-points redemptions go through /api/dashboard/orders, NOT here. This
 * route refuses if the ambassador has enough points.
 */

type SbWithRpc = {
  rpc: (
    fn: "amb_init_paid_order" | "amb_cancel_order",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: { code?: string; message: string } | null }>;
};

type RazorpayOrder = {
  id: string;
  amount: number | string;
  currency: string;
  receipt?: string;
};

const DEFAULT_RATE = 0.10;

export async function POST(req: Request) {
  try {
    const gate = await requireAmbassadorForApi();
    if (!gate.ok) return gate.response;

    let body: { product_id?: string; points_to_use?: number };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const productId = body.product_id?.trim();
    if (!productId) {
      return Response.json({ error: "product_id is required." }, { status: 400 });
    }

    // Optional: ambassador can choose how many of their points to use. If
    // not provided, default to using all available (existing behavior).
    const explicitPointsToUse =
      typeof body.points_to_use === "number" ? body.points_to_use : null;
    if (
      explicitPointsToUse !== null &&
      (!Number.isInteger(explicitPointsToUse) || explicitPointsToUse < 0)
    ) {
      return Response.json(
        { error: "points_to_use must be a non-negative integer." },
        { status: 400 },
      );
    }

    const sb = createAdminClient();
    const sbRpc = sb as unknown as SbWithRpc;

    // Read product, balance, and rate in parallel.
    const [productRes, balRes, rateRes] = await Promise.all([
      sb
        .from("amb_products")
        .select("id, name, points_cost, inr_cost, is_active, stock")
        .eq("id", productId)
        .maybeSingle(),
      sb
        .from("amb_v_user_balances")
        .select("balance")
        .eq("user_id", gate.ctx.profileId)
        .maybeSingle(),
      sb
        .from("amb_settings")
        .select("value")
        .eq("key", "points_to_inr_rate")
        .maybeSingle(),
    ]);

    const product = productRes.data;
    if (!product) {
      return Response.json({ error: "Product not found." }, { status: 404 });
    }
    if (!product.is_active) {
      return Response.json({ error: "Product is archived." }, { status: 409 });
    }
    if (Number(product.inr_cost) > 0) {
      return Response.json(
        { error: "This product has an intrinsic INR price; hybrid not supported." },
        { status: 422 },
      );
    }
    if (product.stock !== null && product.stock <= 0) {
      return Response.json({ error: "Out of stock." }, { status: 409 });
    }

    const balance = balRes.data?.balance ?? 0;
    const maxPointsToUse = Math.min(balance, product.points_cost);
    const pointsToUse =
      explicitPointsToUse !== null
        ? Math.min(explicitPointsToUse, maxPointsToUse)
        : maxPointsToUse;

    if (explicitPointsToUse !== null && explicitPointsToUse > maxPointsToUse) {
      return Response.json(
        {
          error: `points_to_use cannot exceed ${maxPointsToUse} (your balance and the product price both cap it).`,
        },
        { status: 400 },
      );
    }

    const shortfallPts = product.points_cost - pointsToUse;
    if (shortfallPts <= 0) {
      return Response.json(
        {
          error:
            "Nothing to pay — use the regular redeem flow with the same points_to_use.",
        },
        { status: 400 },
      );
    }

    const rateRaw = rateRes.data?.value;
    const rate =
      typeof rateRaw === "number"
        ? rateRaw
        : Number(rateRaw ?? DEFAULT_RATE) || DEFAULT_RATE;

    // Ceil so we never under-charge by sub-paise rounding. The DB function
    // re-validates this expectation with a 1-paise tolerance.
    const inrPaise = Math.ceil(shortfallPts * rate * 100);

    // Create our pending order first.
    const { data: orderId, error: initErr } = await sbRpc.rpc(
      "amb_init_paid_order",
      {
        p_user_id: gate.ctx.profileId,
        p_product_id: productId,
        p_points_to_use: pointsToUse,
        p_inr_amount_paise: inrPaise,
      },
    );
    if (initErr || !orderId) {
      const msg = initErr?.message ?? "Failed to initiate order.";
      const status = msg.includes("not found")
        ? 404
        : msg.includes("Out of stock") ||
            msg.includes("archived") ||
            msg.includes("Insufficient balance") ||
            msg.includes("INR amount mismatch") ||
            msg.includes("intrinsic INR price")
          ? 409
          : 500;
      return Response.json({ error: msg }, { status });
    }

    // Create the Razorpay order. If this fails, roll back our pending
    // order so we don't leak orphans.
    let rzpOrder: RazorpayOrder;
    try {
      rzpOrder = (await razorpay().orders.create({
        amount: inrPaise,
        currency: "INR",
        receipt: orderId,
        notes: {
          product_id: productId,
          profile_id: gate.ctx.profileId,
        },
      })) as unknown as RazorpayOrder;

      // Stash the Razorpay order id on our row so admin can correlate
      // with Razorpay dashboard / support. Best-effort — if this UPDATE
      // fails we still proceed; the data is purely audit-flavored.
      const { error: updErr } = await sb
        .from("amb_orders")
        .update({ razorpay_order_id: rzpOrder.id })
        .eq("id", orderId);
      if (updErr) {
        console.warn(
          "[payment-init] could not stash razorpay_order_id on order",
          orderId,
          updErr.message,
        );
      }
    } catch (err) {
      // Log the full structured error to the server console so we can see
      // statusCode + nested fields. Razorpay's SDK throws an object like
      //   { statusCode: 400, error: { code, description, source, ... } }
      // — calling String() on it gives "[object Object]" which is useless
      // to the user.
      console.error("[payment-init] razorpay.orders.create error:", err);

      await sbRpc.rpc("amb_cancel_order", {
        p_order_id: orderId,
        p_admin_notes: "Razorpay order creation failed — auto-cancelled.",
      });

      return Response.json(
        { error: `Could not create Razorpay order: ${describeRazorpayError(err)}` },
        { status: 502 },
      );
    }

    return Response.json({
      order_id: orderId,
      razorpay_order_id: rzpOrder.id,
      amount_paise: inrPaise,
      currency: "INR",
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      product_name: product.name,
      points_to_use: pointsToUse,
      shortfall_points: shortfallPts,
      prefill: {
        name: `${gate.ctx.profile.first_name} ${gate.ctx.profile.last_name}`.trim(),
        email: gate.ctx.profile.email,
      },
    });
  } catch (err) {
    console.error("[payment-init] uncaught:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * Extract a user-readable message from a Razorpay SDK error. The SDK
 * throws plain objects, NOT Error instances, so `String(err)` returns
 * "[object Object]" and `err instanceof Error` is false.
 *
 * Real Razorpay error shape:
 *   { statusCode: 400, error: { code, description, source, step, reason, ... } }
 */
function describeRazorpayError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const e = err as {
      error?: { description?: string; code?: string; reason?: string };
      statusCode?: number;
      message?: string;
    };
    if (e.error?.description) return e.error.description;
    if (e.error?.reason) return e.error.reason;
    if (e.error?.code) return e.error.code;
    if (e.message) return e.message;
    try {
      return JSON.stringify(err);
    } catch {
      return "(unprintable error)";
    }
  }
  return String(err);
}
