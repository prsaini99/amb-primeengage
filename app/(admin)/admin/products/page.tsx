import Link from "next/link";
import { Plus } from "lucide-react";

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
export const metadata = { title: "Products · Admin" };

type TypeFilter = "all" | "merchandise" | "voucher";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const filter = (
    ["all", "merchandise", "voucher"].includes(params.type ?? "")
      ? params.type
      : "all"
  ) as TypeFilter;

  const sb = createAdminClient();
  let query = sb
    .from("amb_products")
    .select("id, type, name, points_cost, inr_cost, stock, is_active, image_url, created_at")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });
  if (filter !== "all") query = query.eq("type", filter);

  const { data: products, error } = await query;

  return (
    <>
      <PageHeading
        title="Products"
        subtitle="Items Yuvaah Club members can redeem with points (and / or money in Phase 3)."
        actions={
          <Link
            href="/admin/products/new"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-amber-500 text-white text-[12.5px] font-semibold hover:bg-amber-400"
          >
            <Plus size={14} /> New product
          </Link>
        }
      />

      <FilterBar>
        <FilterChipLink href="/admin/products?type=all" active={filter === "all"}>
          All
        </FilterChipLink>
        <FilterChipLink
          href="/admin/products?type=merchandise"
          active={filter === "merchandise"}
        >
          Merchandise
        </FilterChipLink>
        <FilterChipLink
          href="/admin/products?type=voucher"
          active={filter === "voucher"}
        >
          Vouchers
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
            <Th>Image</Th>
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>Points</Th>
            <Th>INR</Th>
            <Th>Stock</Th>
            <Th>Created</Th>
            <Th>Status</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody>
          {(!products || products.length === 0) && (
            <tr>
              <td
                colSpan={9}
                className="px-4 py-10 text-center text-mute border-b border-line"
              >
                No products yet.{" "}
                <Link
                  href="/admin/products/new"
                  className="text-navy-800 font-semibold hover:text-amber-500"
                >
                  Add the first one →
                </Link>
              </td>
            </tr>
          )}
          {products?.map((p) => (
            <tr key={p.id} className="hover:bg-paper/60">
              <Td>
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt=""
                    className="h-10 w-10 rounded-md object-cover ring-1 ring-line"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-md bg-paper ring-1 ring-line" />
                )}
              </Td>
              <Td className="font-semibold">{p.name}</Td>
              <Td>
                <Badge tone={p.type === "voucher" ? "info" : "neutral"}>
                  {p.type}
                </Badge>
              </Td>
              <Td className="font-mono text-[13px]">{p.points_cost}</Td>
              <Td className="font-mono text-[13px]">
                {Number(p.inr_cost) === 0 ? "—" : inr(Number(p.inr_cost))}
              </Td>
              <Td className="font-mono text-[13px]">
                {p.stock === null ? "∞" : p.stock}
              </Td>
              <Td className="text-mute whitespace-nowrap">{fmtDate(p.created_at)}</Td>
              <Td>
                <Badge tone={p.is_active ? "success" : "danger"}>
                  {p.is_active ? "active" : "archived"}
                </Badge>
              </Td>
              <Td className="text-right">
                <Link
                  href={`/admin/products/${p.id}`}
                  className="text-[12.5px] font-semibold text-navy-800 hover:text-amber-500"
                >
                  Open →
                </Link>
              </Td>
            </tr>
          ))}
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
