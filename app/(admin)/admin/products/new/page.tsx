import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ProductForm } from "@/components/admin/product-form";
import { createProduct } from "@/app/actions/products";

export const metadata = { title: "New product · Admin" };

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to products
        </Link>
        <h1 className="font-display text-3xl font-semibold text-navy-900 mt-3">
          New product
        </h1>
        <p className="text-[13.5px] text-mute mt-1">
          Visible to ambassadors as soon as it's saved (unless archived).
        </p>
      </div>

      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8 max-w-3xl">
        <ProductForm mode="create" action={createProduct} />
      </div>
    </div>
  );
}
