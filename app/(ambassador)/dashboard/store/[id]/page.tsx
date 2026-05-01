import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge, inr } from "@/components/admin/table";
import { RedemptionPanel } from "@/components/dashboard/redemption-panel";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DEFAULT_RATE = 0.10;

export default async function StoreProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profileId } = await requireAmbassador();
  const sb = createAdminClient();

  const [productRes, balRes, rateRes] = await Promise.all([
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
    sb
      .from("amb_settings")
      .select("value")
      .eq("key", "points_to_inr_rate")
      .maybeSingle(),
  ]);

  const product = productRes.data;
  if (!product || !product.is_active) notFound();

  const balance = balRes.data?.balance ?? 0;
  const inrCost = Number(product.inr_cost);
  const rateRaw = rateRes.data?.value;
  const rate =
    typeof rateRaw === "number"
      ? rateRaw
      : Number(rateRaw ?? DEFAULT_RATE) || DEFAULT_RATE;

  const outOfStock = product.stock !== null && product.stock <= 0;
  const moneyRequired = inrCost > 0; // intrinsic-INR products still gated

  let disabled = false;
  let disabledReason: string | undefined;
  if (outOfStock) {
    disabled = true;
    disabledReason = "Out of stock";
  } else if (moneyRequired) {
    disabled = true;
    disabledReason = "Money-priced products not yet supported";
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
              {product.stock !== null && <span>{product.stock} in stock</span>}
            </div>
          </div>

          <RedemptionPanel
            productId={product.id}
            productName={product.name}
            pointsCost={product.points_cost}
            balance={balance}
            rate={rate}
            disabled={disabled}
            disabledReason={disabledReason}
          />

          <p className="text-[12px] text-mute leading-relaxed">
            Drag the slider to choose how many of your points to spend; the
            rest auto-bills as INR via Razorpay. Redemptions complete
            instantly. For vouchers, admin sends the code via chat — it'll
            appear in your order's notes once delivered. For merchandise,
            watch for shipping updates.
          </p>
        </div>
      </div>
    </div>
  );
}
