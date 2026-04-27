"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "amb_gallery";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export type GalleryFormResult = { ok: false; error: string };

// ---------- upload -----------------------------------------------------------

export async function uploadGalleryImage(
  _prev: GalleryFormResult | null,
  formData: FormData,
): Promise<GalleryFormResult | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const image = formData.get("image");
  const caption = String(formData.get("caption") ?? "").trim();

  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, error: "Image is required." };
  }
  if (image.size > MAX_BYTES) {
    return { ok: false, error: "Image must be 5 MB or smaller." };
  }
  if (!ALLOWED_MIME.includes(image.type as (typeof ALLOWED_MIME)[number])) {
    return { ok: false, error: "Image must be JPEG, PNG, or WebP." };
  }

  const sb = createAdminClient();

  const ext =
    image.name.split(".").pop()?.toLowerCase() ??
    (image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg");
  const month = new Date().toISOString().slice(0, 7);
  const path = `${month}/${randomUUID()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, image, {
      contentType: image.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) {
    return { ok: false, error: `Upload failed: ${upErr.message}` };
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);

  const { error: insertErr } = await sb.from("amb_gallery").insert({
    image_url: pub.publicUrl,
    caption: caption || null,
    created_by: gate.profileId,
  });
  if (insertErr) {
    // Roll back the bucket upload so we don't orphan the file.
    await sb.storage.from(BUCKET).remove([path]);
    return { ok: false, error: insertErr.message };
  }

  revalidatePath("/admin/gallery");
  revalidatePath("/dashboard/gallery");
  redirect("/admin/gallery");
}

// ---------- delete -----------------------------------------------------------

export async function deleteGalleryImage(id: string) {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false as const, error: "Not authorized." };

  const sb = createAdminClient();

  // Fetch image_url so we can also remove from storage.
  const { data: row } = await sb
    .from("amb_gallery")
    .select("image_url")
    .eq("id", id)
    .maybeSingle();

  const { error: delErr } = await sb.from("amb_gallery").delete().eq("id", id);
  if (delErr) return { ok: false as const, error: delErr.message };

  // Best-effort storage cleanup. Public URL → bucket path.
  // Public URLs look like: <SUPABASE_URL>/storage/v1/object/public/amb_gallery/<path>
  if (row?.image_url) {
    const marker = `/object/public/${BUCKET}/`;
    const idx = row.image_url.indexOf(marker);
    if (idx !== -1) {
      const path = row.image_url.slice(idx + marker.length);
      await sb.storage.from(BUCKET).remove([path]);
    }
  }

  revalidatePath("/admin/gallery");
  revalidatePath("/dashboard/gallery");
  return { ok: true as const };
}
