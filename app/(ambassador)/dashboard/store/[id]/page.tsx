import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge, inr } from "@/components/admin/table";
import { RedeemButton } from "@/components/dashboard/redeem-button";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function StoreProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profileId } = await requireAmbassador();
  const sb = createAdminClient();

  const [productRes, balRes] = await Promise.all([
    sb
      .from("amb_products")
      .select("id, type, name, description, image_url, points_cost, inr_cost, stock, is_active")
      .eq("id", id)
      .maybeSingle(),
    sb
      .from("amb_v_user_balances")
      .select("balance")
      .eq("user_id", profileId)
      .maybeSingle(),
  ]);

  const product = productRes.data;
  if (!product || !product.is_active) notFound();

  const balance = balRes.data?.balance ?? 0;
  const inrCost = Number(product.inr_cost);
  const outOfStock = product.stock !== null && product.stock <= 0;
  const cantAfford = inrCost === 0 && product.points_cost > balance;
  const moneyRequired = inrCost > 0;

  let disabled = false;
  let disabledReason: string | undefined;
  if (outOfStock) {
    disabled = true;
    disabledReason = "Out of stock";
  } else if (moneyRequired) {
    disabled = true;
    disabledReason = "Money payments coming in Phase 3";
  } else if (cantAfford) {
    disabled = true;
    disabledReason = `Need ${product.points_cost - balance} more points`;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/store"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
      >
        <ArrowLeft size={14} /> Back to store
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line shadow-soft overflow-hidden">
          <div className="aspect-square bg-paper relative">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 brand-gradient opacity-90" />
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <Badge tone={product.type === "voucher" ? "info" : "neutral"}>
              {product.type}
            </Badge>
            <h1 className="font-display text-3xl font-semibold text-navy-900 mt-3">
              {product.name}
            </h1>
            {product.description && (
              <p className="mt-3 text-[14.5px] leading-relaxed text-ink whitespace-pre-wrap">
                {product.description}
              </p>
            )}
          </div>

          <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-5">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold text-navy-900">
                {product.points_cost}
              </span>
              <span className="text-[14px] text-mute">points</span>
              {inrCost > 0 && (
                <span className="text-[14px] text-mute">+ {inr(inrCost)}</span>
              )}
            </div>
            <div className="mt-3 text-[12.5px] text-mute">
              Your balance:{" "}
              <span className="font-semibold text-navy-900">{balance}</span> points
              {product.stock !== null && (
                <>
                  {" · "}
                  <span>{product.stock} in stock</span>
                </>
              )}
            </div>
          </div>

          <RedeemButton
            productId={product.id}
            productName={product.name}
            pointsCost={product.points_cost}
            disabled={disabled}
            disabledReason={disabledReason}
          />

          <p className="text-[12px] text-mute leading-relaxed">
            On redemption, points are debited and your order is placed in the
            queue. Admin fulfills manually — for vouchers, the code lands in
            your order details. For merchandise, watch for shipping updates.
          </p>
        </div>
      </div>
    </div>
  );
}
