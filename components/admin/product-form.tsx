"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertCircle, Save } from "lucide-react";

import type { ProductFormResult } from "@/app/actions/products";

type Mode =
  | {
      mode: "create";
      action: (
        prev: ProductFormResult | null,
        fd: FormData,
      ) => Promise<ProductFormResult | null>;
    }
  | {
      mode: "edit";
      action: (
        prev: ProductFormResult | null,
        fd: FormData,
      ) => Promise<ProductFormResult | null>;
      initial: {
        type: "merchandise" | "voucher";
        name: string;
        description: string;
        points_cost: number;
        inr_cost: number;
        stock: number | null;
        image_url: string | null;
      };
    };

export function ProductForm(props: Mode) {
  const [state, action, pending] = useActionState<
    ProductFormResult | null,
    FormData
  >(props.action, null);

  const initial = props.mode === "edit" ? props.initial : null;
  const [removeImage, setRemoveImage] = useState(false);

  return (
    <form action={action} className="space-y-5">
      <Field label="Type">
        <select
          name="type"
          required
          defaultValue={initial?.type ?? "merchandise"}
          disabled={pending}
          suppressHydrationWarning
          className={inputCls}
        >
          <option value="merchandise">Merchandise</option>
          <option value="voucher">Voucher</option>
        </select>
      </Field>

      <Field label="Name">
        <input
          name="name"
          required
          maxLength={200}
          defaultValue={initial?.name ?? ""}
          disabled={pending}
          suppressHydrationWarning
          className={inputCls}
        />
      </Field>

      <Field label="Description" hint="Plain text. Line breaks preserved.">
        <textarea
          name="description"
          rows={4}
          defaultValue={initial?.description ?? ""}
          disabled={pending}
          suppressHydrationWarning
          className={inputCls + " resize-y min-h-[100px]"}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Points cost" hint="0 = no points required.">
          <input
            name="points_cost"
            type="number"
            min={0}
            max={1_000_000}
            step={1}
            required
            defaultValue={initial?.points_cost ?? 100}
            disabled={pending}
            suppressHydrationWarning
            className={inputCls}
          />
        </Field>

        <Field label="INR cost" hint="0 = pure points. > 0 needs Phase 3 payments.">
          <input
            name="inr_cost"
            type="number"
            min={0}
            max={1_000_000}
            step="0.01"
            required
            defaultValue={initial?.inr_cost ?? 0}
            disabled={pending}
            suppressHydrationWarning
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Stock" hint="Empty = unlimited.">
        <input
          name="stock"
          type="number"
          min={0}
          max={1_000_000}
          step={1}
          defaultValue={initial?.stock ?? ""}
          disabled={pending}
          suppressHydrationWarning
          className={inputCls}
        />
      </Field>

      <Field label="Image (optional)" hint="JPEG / PNG / WebP, ≤5 MB.">
        <input
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          suppressHydrationWarning
          className="block w-full text-[13px] text-mute file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-navy-900 file:text-white file:text-[12.5px] file:font-semibold hover:file:bg-navy-800 disabled:opacity-50"
        />
      </Field>

      {props.mode === "edit" && initial?.image_url && (
        <div className="flex items-center gap-3 rounded-xl bg-paper ring-1 ring-line p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={initial.image_url}
            alt="Current"
            className="h-12 w-12 rounded-md object-cover ring-1 ring-line"
          />
          <div className="flex-1 text-[13px] text-mute">Current image.</div>
          <label className="inline-flex items-center gap-2 text-[12.5px] text-mute">
            <input
              name="remove_image"
              type="checkbox"
              checked={removeImage}
              onChange={(e) => setRemoveImage(e.target.checked)}
              disabled={pending}
              suppressHydrationWarning
            />
            Remove
          </label>
        </div>
      )}

      {state && !state.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 text-[13.5px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft disabled:opacity-60"
        >
          <Save size={15} />
          {pending
            ? props.mode === "create" ? "Creating…" : "Saving…"
            : props.mode === "create" ? "Create product" : "Save changes"}
        </button>
        <Link href="/admin/products" className="text-[13px] text-mute hover:text-navy-900">
          Cancel
        </Link>
      </div>
    </form>
  );
}

const inputCls =
  "w-full mt-2 rounded-xl bg-paper-2 ring-1 ring-line px-4 py-3 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
        {label}
      </span>
      {children}
      {hint && <span className="text-[12px] text-mute mt-1.5 block">{hint}</span>}
    </label>
  );
}
