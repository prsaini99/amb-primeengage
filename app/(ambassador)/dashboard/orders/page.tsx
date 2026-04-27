import Link from "next/link";

import { Badge, fmtDate, inr } from "@/components/admin/table";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "My orders · Ambassador" };

function fulfillmentTone(s: string):
  | { tone: "success" | "warn" | "danger" | "info"; label: string } {
  if (s === "fulfilled") return { tone: "success", label: "fulfilled" };
  if (s === "cancelled") return { tone: "danger", label: "cancelled" };
  return { tone: "info", label: "pending" };
}

export default async function MyOrdersPage() {
  const { profileId } = await requireAmbassador();
  const sb = createAdminClient();

  const { data: orders, error } = await sb
    .from("amb_orders")
    .select(
      "id, product_id, points_used, inr_paid, payment_status, fulfillment_status, admin_notes, created_at",
    )
    .eq("user_id", profileId)
    .order("created_at", { ascending: false });

  // Resolve product info in one batch.
  const productIds = Array.from(new Set((orders ?? []).map((o) => o.product_id)));
  const productsById: Record<
    string,
    { name: string; image_url: string | null; type: string }
  > = {};
  if (productIds.length > 0) {
    const { data: products } = await sb
      .from("amb_products")
      .select("id, name, image_url, type")
      .in("id", productIds);
    for (const p of products ?? []) productsById[p.id] = p;
  }

  return (
    <>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-navy-900">
            My orders
          </h1>
          <p className="text-[13.5px] text-mute mt-1">
            Your redemption history. Voucher codes land in the notes once
            fulfilled.
          </p>
        </div>
        <Link
          href="/dashboard/store"
          className="text-[12.5px] font-semibold text-navy-800 hover:text-amber-500"
        >
          Browse store →
        </Link>
      </div>

      {error && (
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
          {error.message}
        </div>
      )}

      {!error && (!orders || orders.length === 0) && (
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-10 text-center">
          <p className="text-[14px] text-mute">
            You haven't redeemed anything yet.{" "}
            <Link
              href="/dashboard/store"
              className="text-navy-800 font-semibold hover:text-amber-500"
            >
              Open the store →
            </Link>
          </p>
        </div>
      )}

      <div className="space-y-3">
        {orders?.map((o) => {
          const product = productsById[o.product_id];
          const status = fulfillmentTone(o.fulfillment_status);
          return (
            <div
              key={o.id}
              className="rounded-2xl bg-paper-2 ring-1 ring-line p-4 md:p-5 flex flex-wrap items-center gap-4"
            >
              {product?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image_url}
                  alt=""
                  className="h-16 w-16 rounded-md object-cover ring-1 ring-line shrink-0"
                />
              ) : (
                <div className="h-16 w-16 rounded-md bg-paper ring-1 ring-line shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="font-semibold text-navy-900 truncate">
                    {product?.name ?? "Unknown product"}
                  </p>
                  {product?.type && (
                    <Badge tone={product.type === "voucher" ? "info" : "neutral"}>
                      {product.type}
                    </Badge>
                  )}
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <div className="text-[12.5px] text-mute mt-1">
                  {fmtDate(o.created_at)} · {o.points_used} pts
                  {Number(o.inr_paid) > 0 && ` + ${inr(Number(o.inr_paid))}`}
                </div>
                {o.admin_notes && (
                  <p className="mt-2 text-[13px] text-ink bg-paper rounded-lg px-3 py-2 ring-1 ring-line whitespace-pre-wrap">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-mute mr-2">
                      From admin:
                    </span>
                    {o.admin_notes}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
