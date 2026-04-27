import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge, fmtDate, inr } from "@/components/admin/table";
import { ProductForm } from "@/components/admin/product-form";
import { ProductArchiveButton } from "@/components/admin/product-archive-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateProduct } from "@/app/actions/products";

export const dynamic = "force-dynamic";

export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createAdminClient();

  const { data: product } = await sb
    .from("amb_products")
    .select("id, type, name, description, points_cost, inr_cost, stock, image_url, is_active, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!product) notFound();

  // Order count for this product (head:true returns count without rows).
  const { count: orderCount } = await sb
    .from("amb_orders")
    .select("*", { head: true, count: "exact" })
    .eq("product_id", id);

  const updateAction = updateProduct.bind(null, product.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to products
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">
              {product.name}
            </h1>
            <p className="text-[13.5px] text-mute mt-1">
              {product.type} · {product.points_cost} pts
              {Number(product.inr_cost) > 0 && ` + ${inr(Number(product.inr_cost))}`} ·
              stock {product.stock === null ? "unlimited" : product.stock} · created{" "}
              {fmtDate(product.created_at)}
            </p>
          </div>
          <Badge tone={product.is_active ? "success" : "danger"}>
            {product.is_active ? "active" : "archived"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute mb-4">
              Edit
            </h3>
            <ProductForm
              mode="edit"
              action={updateAction}
              initial={{
                type: product.type as "merchandise" | "voucher",
                name: product.name,
                description: product.description,
                points_cost: product.points_cost,
                inr_cost: Number(product.inr_cost),
                stock: product.stock,
                image_url: product.image_url,
              }}
            />
          </div>
        </section>

        <aside className="space-y-6">
          <Card title="Lifecycle">
            <ProductArchiveButton id={product.id} isActive={product.is_active} />
            <p className="mt-3 text-[12.5px] text-mute leading-relaxed">
              Archiving hides the product from the ambassador store. Existing
              orders are unaffected.
            </p>
          </Card>

          <Card title="Orders">
            <p className="text-[14px] text-navy-900">
              <span className="font-display text-3xl font-bold">
                {orderCount ?? 0}
              </span>{" "}
              placed
            </p>
            <Link
              href={`/admin/orders?product=${product.id}`}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-navy-800 hover:text-amber-500"
            >
              View orders →
            </Link>
            <p className="mt-2 text-[11.5px] text-mute">
              (Orders page lands in Batch P2b.)
            </p>
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
