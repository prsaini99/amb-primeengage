import Link from "next/link";

import { Badge, inr } from "@/components/admin/table";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Store · Yuvaah" };

type TypeFilter = "all" | "merchandise" | "voucher" | "affordable";

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const filter = (
    ["all", "merchandise", "voucher", "affordable"].includes(params.type ?? "")
      ? params.type
      : "all"
  ) as TypeFilter;

  const { profileId } = await requireAmbassador();
  const sb = createAdminClient();

  // Balance + product list in parallel.
  const [balRes, productsRes] = await Promise.all([
    sb.from("amb_v_user_balances").select("balance").eq("user_id", profileId).maybeSingle(),
    sb
      .from("amb_products")
      .select("id, type, name, description, image_url, points_cost, inr_cost, stock")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
  ]);

  const balance = balRes.data?.balance ?? 0;
  let products = productsRes.data ?? [];

  // Client-style filter (server-side; cheap for Phase 2 cardinality).
  if (filter === "merchandise" || filter === "voucher") {
    products = products.filter((p) => p.type === filter);
  } else if (filter === "affordable") {
    products = products.filter(
      (p) =>
        Number(p.inr_cost) === 0 &&
        p.points_cost <= balance &&
        (p.stock === null || p.stock > 0),
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-navy-900">
            Store
          </h1>
          <p className="text-[13.5px] text-mute mt-1">
            Redeem your points for merchandise and vouchers.
          </p>
        </div>
        <div className="rounded-xl bg-paper-2 ring-1 ring-line px-4 py-2.5 text-[13px]">
          <span className="text-mute">Your balance:</span>{" "}
          <span className="font-display font-bold text-navy-900 text-[18px]">
            {balance}
          </span>
          <span className="text-mute"> points</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <FilterChipLink href="/dashboard/store?type=all" active={filter === "all"}>
          All
        </FilterChipLink>
        <FilterChipLink
          href="/dashboard/store?type=merchandise"
          active={filter === "merchandise"}
        >
          Merchandise
        </FilterChipLink>
        <FilterChipLink
          href="/dashboard/store?type=voucher"
          active={filter === "voucher"}
        >
          Vouchers
        </FilterChipLink>
        <FilterChipLink
          href="/dashboard/store?type=affordable"
          active={filter === "affordable"}
        >
          I can afford
        </FilterChipLink>
      </div>

      {products.length === 0 && (
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-10 text-center">
          <p className="text-[14px] text-mute">
            {filter === "affordable"
              ? "Nothing matches your current balance yet. Earn more points by completing activities."
              : "No products available right now. Check back soon."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {products.map((p) => {
          const inrCost = Number(p.inr_cost);
          const outOfStock = p.stock !== null && p.stock <= 0;
          const cantAfford = inrCost === 0 && p.points_cost > balance;
          const moneyRequired = inrCost > 0;
          return (
            <Link
              key={p.id}
              href={`/dashboard/store/${p.id}`}
              className="group rounded-2xl bg-paper-2 ring-1 ring-line shadow-soft hover:ring-navy-800/30 hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col"
            >
              <div className="h-44 bg-paper overflow-hidden shrink-0">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full brand-gradient opacity-90" />
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-start gap-2 justify-between">
                  <h3 className="font-display text-[16px] font-semibold text-navy-900 leading-tight group-hover:text-amber-500 transition-colors line-clamp-2">
                    {p.name}
                  </h3>
                  <Badge tone={p.type === "voucher" ? "info" : "neutral"}>
                    {p.type}
                  </Badge>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-[18px] font-bold text-navy-900">
                    {p.points_cost}
                  </span>
                  <span className="text-[12.5px] text-mute">pts</span>
                  {inrCost > 0 && (
                    <span className="text-[12.5px] text-mute">
                      + {inr(inrCost)}
                    </span>
                  )}
                </div>
                <div className="mt-auto pt-3">
                  {outOfStock ? (
                    <span className="text-[12px] text-amber-500 font-semibold">
                      Out of stock
                    </span>
                  ) : moneyRequired ? (
                    <span className="text-[12px] text-mute">
                      Money payments coming in Phase 3
                    </span>
                  ) : cantAfford ? (
                    <span className="text-[12px] text-mute">
                      Need {p.points_cost - balance} more points
                    </span>
                  ) : (
                    <span className="text-[12px] font-semibold text-navy-800 group-hover:text-amber-500 transition-colors">
                      View →
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function FilterChipLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "px-3.5 h-8 inline-flex items-center rounded-full text-[12.5px] font-medium ring-1 transition-colors " +
        (active
          ? "bg-navy-900 text-white ring-navy-900"
          : "bg-paper-2 text-mute ring-line-strong hover:text-navy-900")
      }
    >
      {children}
    </Link>
  );
}
