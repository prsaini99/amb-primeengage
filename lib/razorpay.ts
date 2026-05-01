import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

/**
 * Razorpay server SDK wrapper. Lazy-instantiated, server-only — the
 * `key_secret` must NEVER reach the browser. Mirrors lib/supabase/admin.ts.
 *
 * Required env vars (.env.local):
 *   RAZORPAY_KEY_ID            = rzp_test_xxx
 *   RAZORPAY_KEY_SECRET        = xxx                  (server only)
 *   NEXT_PUBLIC_RAZORPAY_KEY_ID= rzp_test_xxx          (mirror, for checkout.js)
 */

let cached: Razorpay | null = null;

export function razorpay(): Razorpay {
  if (cached) return cached;

  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env.local",
    );
  }

  cached = new Razorpay({ key_id, key_secret });
  return cached;
}

/**
 * Verify a Razorpay payment signature returned by the client-side checkout
 * `handler` callback. Razorpay signs `<order_id>|<payment_id>` with HMAC-SHA256
 * using the secret key. Constant-time compare prevents timing-attack
 * fingerprinting of the secret.
 */
export function verifyPaymentSignature(
  razorpay_order_id: string,
  razorpay_payment_id: string,
  razorpay_signature: string,
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;

  const expected = createHmac("sha256", secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  // Buffer lengths must match for timingSafeEqual; if they don't, signatures
  // can't match anyway.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(razorpay_signature, "hex");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
