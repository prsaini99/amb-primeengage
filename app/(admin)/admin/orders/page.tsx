import Link from "next/link";

import {
  PageHeading,
  TableShell,
  Th,
  Td,
  Badge,
  FilterBar,
  fmtDate,
  inr,
} from "@/components/admin/table";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders · Admin" };

type StatusFilter = "all" | "pending" | "fulfilled" | "cancelled";

function fulfillmentTone(s: string): "success" | "warn" | "danger" | "info" {
  if (s === "fulfilled") return "success";
  if (s === "cancelled") return "danger";
  return "info";
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; product?: string }>;
}) {
  const params = await searchParams;
  const filter = (
    ["all", "pending", "fulfilled", "cancelled"].includes(params.status ?? "")
      ? params.status
      : "all"
  ) as StatusFilter;

  const sb = createAdminClient();
  let query = sb
    .from("amb_orders")
    .select(
      "id, user_id, product_id, points_used, inr_paid, payment_status, fulfillment_status, created_at",
    )
    .order("created_at", { ascending: false });
  if (filter !== "all") query = query.eq("fulfillment_status", filter);
  if (params.product) query = query.eq("product_id", params.product);

  const { data: orders, error } = await query;
  const list = orders ?? [];

  const userIds = Array.from(new Set(list.map((o) => o.user_id)));
  const productIds = Array.from(new Set(list.map((o) => o.product_id)));

  const [profilesRes, productsRes, counts] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] })
      : sb.from("amb_profiles").select("id, first_name, last_name").in("id", userIds),
    productIds.length === 0
      ? Promise.resolve({ data: [] as { id: string; name: string; type: string }[] })
      : sb.from("amb_products").select("id, name, type").in("id", productIds),
    getStatusCounts(sb),
  ]);

  const profilesById = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [p.id, p]),
  );
  const productsById = Object.fromEntries(
    (productsRes.data ?? []).map((p) => [p.id, p]),
  );

  return (
    <>
      <PageHeading
        title="Orders"
        subtitle={`${counts.fulfilled} fulfilled · ${counts.pending} awaiting payment · ${counts.cancelled} cancelled`}
      />

      <FilterBar>
        <FilterChipLink href="/admin/orders?status=all" active={filter === "all"}>
          All ({counts.all})
        </FilterChipLink>
        <FilterChipLink
          href="/admin/orders?status=fulfilled"
          active={filter === "fulfilled"}
        >
          Fulfilled ({counts.fulfilled})
        </FilterChipLink>
        <FilterChipLink
          href="/admin/orders?status=pending"
          active={filter === "pending"}
        >
          Awaiting payment ({counts.pending})
        </FilterChipLink>
        <FilterChipLink
          href="/admin/orders?status=cancelled"
          active={filter === "cancelled"}
        >
          Cancelled ({counts.cancelled})
        </FilterChipLink>
      </FilterBar>

      {error && (
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
          {error.message}
        </div>
      )}

      <TableShell>
        <thead>
          <tr>
            <Th>Placed</Th>
            <Th>Member</Th>
            <Th>Product</Th>
            <Th>Points</Th>
            <Th>INR</Th>
            <Th>Status</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-10 text-center text-mute border-b border-line"
              >
                No orders match this filter.
              </td>
            </tr>
          )}
          {list.map((o) => {
            const ambassador = profilesById[o.user_id];
            const product = productsById[o.product_id];
            return (
              <tr key={o.id} className="hover:bg-paper/60">
                <Td className="text-mute whitespace-nowrap">
                  {fmtDate(o.created_at)}
                </Td>
                <Td className="font-semibold">
                  {ambassador
                    ? `${ambassador.first_name} ${ambassador.last_name}`
                    : "—"}
                </Td>
                <Td>
                  <div className="font-medium">{product?.name ?? "—"}</div>
                  {product?.type && (
                    <div className="text-mute text-[12px]">{product.type}</div>
                  )}
                </Td>
                <Td className="font-mono text-[13px]">{o.points_used}</Td>
                <Td className="font-mono text-[13px]">
                  {Number(o.inr_paid) === 0 ? "—" : inr(Number(o.inr_paid))}
                </Td>
                <Td>
                  <Badge tone={fulfillmentTone(o.fulfillment_status)}>
                    {o.fulfillment_status}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="text-[12.5px] font-semibold text-navy-800 hover:text-amber-500"
                  >
                    Open →
                  </Link>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
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

async function getStatusCounts(sb: ReturnType<typeof createAdminClient>) {
  const base = sb.from("amb_orders").select("*", { head: true, count: "exact" });
  const [all, pending, fulfilled, cancelled] = await Promise.all([
    base,
    sb.from("amb_orders").select("*", { head: true, count: "exact" }).eq("fulfillment_status", "pending"),
    sb.from("amb_orders").select("*", { head: true, count: "exact" }).eq("fulfillment_status", "fulfilled"),
    sb.from("amb_orders").select("*", { head: true, count: "exact" }).eq("fulfillment_status", "cancelled"),
  ]);
  return {
    all: all.count ?? 0,
    pending: pending.count ?? 0,
    fulfilled: fulfilled.count ?? 0,
    cancelled: cancelled.count ?? 0,
  };
}
