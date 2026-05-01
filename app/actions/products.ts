"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type ProductUpdate = Database["public"]["Tables"]["amb_products"]["Update"];

const IMAGE_BUCKET = "amb_products";
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export type ProductFormResult =
  | { ok: false; error: string }
  | { ok: true };

// ---------- create -----------------------------------------------------------

export async function createProduct(
  _prev: ProductFormResult | null,
  formData: FormData,
): Promise<ProductFormResult | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const parsed = parseProductForm(formData);
  if (!parsed.ok) return parsed;

  const sb = createAdminClient();

  let imageUrl: string | null = null;
  if (parsed.image) {
    const upload = await uploadImage(sb, parsed.image);
    if (!upload.ok) return upload;
    imageUrl = upload.publicUrl;
  }

  const { data, error } = await sb
    .from("amb_products")
    .insert({
      type: parsed.type,
      name: parsed.name,
      description: parsed.description,
      points_cost: parsed.points_cost,
      inr_cost: parsed.inr_cost,
      stock: parsed.stock,
      image_url: imageUrl,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }

  revalidatePath("/admin/products");
  // Land on the list — admin sees the new row at the top alongside everything
  // else. If they want to edit, they click in.
  redirect("/admin/products");
}

// ---------- update -----------------------------------------------------------

export async function updateProduct(
  id: string,
  _prev: ProductFormResult | null,
  formData: FormData,
): Promise<ProductFormResult | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const parsed = parseProductForm(formData);
  if (!parsed.ok) return parsed;

  const sb = createAdminClient();
  const removeImage = formData.get("remove_image") === "on";

  const update: ProductUpdate = {
    type: parsed.type,
    name: parsed.name,
    description: parsed.description,
    points_cost: parsed.points_cost,
    inr_cost: parsed.inr_cost,
    stock: parsed.stock,
  };
  if (parsed.image) {
    const upload = await uploadImage(sb, parsed.image);
    if (!upload.ok) return upload;
    update.image_url = upload.publicUrl;
  } else if (removeImage) {
    update.image_url = null;
  }

  const { error } = await sb.from("amb_products").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  return { ok: true };
}

// ---------- archive / unarchive ---------------------------------------------

export async function setProductActive(id: string, isActive: boolean) {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false as const, error: "Not authorized." };

  const sb = createAdminClient();
  const { error } = await sb
    .from("amb_products")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  return { ok: true as const };
}

// ---------- helpers ---------------------------------------------------------

type ParseError = { ok: false; error: string };
type ParsedProduct =
  | {
      ok: true;
      type: "merchandise" | "voucher";
      name: string;
      description: string;
      points_cost: number;
      inr_cost: number;
      stock: number | null;
      image: File | null;
    }
  | ParseError;

function parseProductForm(formData: FormData): ParsedProduct {
  const typeRaw = String(formData.get("type") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const pointsRaw = String(formData.get("points_cost") ?? "").trim();
  const inrRaw = String(formData.get("inr_cost") ?? "").trim();
  const stockRaw = String(formData.get("stock") ?? "").trim();
  const image = formData.get("image");

  if (typeRaw !== "merchandise" && typeRaw !== "voucher") {
    return { ok: false, error: "Type must be merchandise or voucher." };
  }
  if (!name || name.length > 200) {
    return { ok: false, error: "Name is required (max 200 chars)." };
  }

  const points_cost = pointsRaw === "" ? 0 : Number(pointsRaw);
  if (!Number.isInteger(points_cost) || points_cost < 0 || points_cost > 1_000_000) {
    return { ok: false, error: "Points cost must be a whole number between 0 and 1,000,000." };
  }
  const inr_cost = inrRaw === "" ? 0 : Number(inrRaw);
  if (!Number.isFinite(inr_cost) || inr_cost < 0 || inr_cost > 1_000_000) {
    return { ok: false, error: "INR cost must be 0 or more (≤ 1,000,000)." };
  }
  if (points_cost === 0 && inr_cost === 0) {
    return { ok: false, error: "A product must cost something — set points or INR (or both)." };
  }

  // Stock: empty = unlimited (null in DB).
  let stock: number | null = null;
  if (stockRaw !== "") {
    const n = Number(stockRaw);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
      return { ok: false, error: "Stock must be a whole number 0 or more (or empty for unlimited)." };
    }
    stock = n;
  }

  let imageFile: File | null = null;
  if (image instanceof File && image.size > 0) {
    if (image.size > IMAGE_MAX_BYTES) {
      return { ok: false, error: "Image must be 5 MB or smaller." };
    }
    if (!IMAGE_MIME.includes(image.type as (typeof IMAGE_MIME)[number])) {
      return { ok: false, error: "Image must be JPEG, PNG, or WebP." };
    }
    imageFile = image;
  }

  return {
    ok: true,
    type: typeRaw,
    name,
    description,
    points_cost,
    // numeric(10,2) — round to 2 decimals to avoid sneaky precision issues.
    inr_cost: Math.round(inr_cost * 100) / 100,
    stock,
    image: imageFile,
  };
}

async function uploadImage(
  sb: ReturnType<typeof createAdminClient>,
  file: File,
): Promise<{ ok: true; publicUrl: string } | ParseError> {
  const ext =
    file.name.split(".").pop()?.toLowerCase() ??
    (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg");
  const month = new Date().toISOString().slice(0, 7);
  const path = `${month}/${randomUUID()}.${ext}`;
  const { error } = await sb.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) return { ok: false, error: `Image upload failed: ${error.message}` };
  const { data } = sb.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return { ok: true, publicUrl: data.publicUrl };
}
