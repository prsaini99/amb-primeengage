import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge, fmtDate, inr } from "@/components/admin/table";
import { OrderActions } from "@/components/admin/order-actions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function fulfillmentTone(s: string): "success" | "warn" | "danger" | "info" {
  if (s === "fulfilled") return "success";
  if (s === "cancelled") return "danger";
  return "info";
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createAdminClient();

  const { data: order } = await sb
    .from("amb_orders")
    .select(
      "id, user_id, product_id, points_used, inr_paid, payment_status, fulfillment_status, payment_ref, razorpay_order_id, admin_notes, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const [profileRes, productRes] = await Promise.all([
    sb
      .from("amb_profiles")
      .select("id, first_name, last_name, email")
      .eq("id", order.user_id)
      .maybeSingle(),
    sb
      .from("amb_products")
      .select("id, name, type, image_url, points_cost, inr_cost")
      .eq("id", order.product_id)
      .maybeSingle(),
  ]);
  const profile = profileRes.data;
  const product = productRes.data;
  if (!profile || !product) notFound();

  // After Phase 3, only cancelled orders are read-only. Fulfilled orders
  // still allow notes editing and cancel-with-refund (return / error case).
  const closed = order.fulfillment_status === "cancelled";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to orders
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">
              Order {order.id.slice(0, 8)}
            </h1>
            <p className="text-[13.5px] text-mute mt-1">
              Placed {fmtDate(order.created_at)} by {profile.first_name}{" "}
              {profile.last_name}
            </p>
          </div>
          <Badge tone={fulfillmentTone(order.fulfillment_status)}>
            {order.fulfillment_status}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-6">
          <Card title="Product">
            <div className="flex gap-4">
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image_url}
                  alt=""
                  className="h-20 w-20 rounded-md object-cover ring-1 ring-line shrink-0"
                />
              ) : (
                <div className="h-20 w-20 rounded-md bg-paper ring-1 ring-line shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <Link
                  href={`/admin/products/${product.id}`}
                  className="font-display text-[20px] font-semibold text-navy-900 hover:text-amber-500"
                >
                  {product.name}
                </Link>
                <div className="text-[13px] text-mute mt-1">
                  Type: {product.type}
                </div>
                <div className="text-[13px] text-mute mt-1">
                  Default price: {product.points_cost} pts
                  {Number(product.inr_cost) > 0 && ` + ${inr(Number(product.inr_cost))}`}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Member">
            <KV label="Name" value={`${profile.first_name} ${profile.last_name}`} />
            <KV label="Email" value={profile.email} mono />
          </Card>

          <Card title="Payment">
            <KV
              label="Status"
              value={
                order.payment_status === "not_required"
                  ? "Not required (pure points)"
                  : order.payment_status
              }
            />
            <KV label="Points used" value={String(order.points_used)} mono />
            <KV
              label="INR paid"
              value={
                Number(order.inr_paid) === 0
                  ? "—"
                  : inr(Number(order.inr_paid))
              }
              mono
            />
            {order.razorpay_order_id && (
              <KV
                label="Razorpay order id"
                value={order.razorpay_order_id}
                mono
              />
            )}
            {order.payment_ref && (
              <KV label="Payment id" value={order.payment_ref} mono />
            )}
            <KV label="Internal id" value={order.id} mono />
          </Card>
        </section>

        <aside>
          <Card title={closed ? "Cancelled" : "Manage order"}>
            {closed ? (
              <>
                <p className="text-[13px] text-mute mb-3">
                  This order is <strong>cancelled</strong>. The notes below
                  are read-only here.
                </p>
                {order.admin_notes ? (
                  <div className="rounded-lg bg-paper ring-1 ring-line px-3 py-2 text-[13px] text-ink whitespace-pre-wrap">
                    {order.admin_notes}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-mute italic">
                    No notes were saved.
                  </p>
                )}
              </>
            ) : (
              <OrderActions
                orderId={order.id}
                initialNotes={order.admin_notes ?? ""}
              />
            )}
            {!closed && (
              <p className="mt-4 text-[12px] text-mute leading-relaxed">
                For vouchers, paste the code into notes and click Save — the
                Yuvaah Club member sees it on their order card. For merchandise,
                tracking numbers / shipping notes work the same way. Cancel +
                refund handles returns and error correction.
              </p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6">
      <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-4 py-2 first:pt-0 border-b border-line last:border-0">
      <div className="min-w-[110px] text-[12px] text-mute font-medium">
        {label}
      </div>
      <div
        className={
          "text-[14px] text-navy-900 " + (mono ? "font-mono text-[13px]" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
