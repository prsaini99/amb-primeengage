"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type EventUpdate = Database["public"]["Tables"]["amb_events"]["Update"];

const COVER_BUCKET = "amb_events";
const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export type EventFormResult =
  | { ok: false; error: string }
  | { ok: true };

// ---------- create -----------------------------------------------------------

export async function createEvent(
  _prev: EventFormResult | null,
  formData: FormData,
): Promise<EventFormResult | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const parsed = parseEventForm(formData);
  if (!parsed.ok) return parsed;

  const sb = createAdminClient();

  let coverUrl: string | null = null;
  if (parsed.cover) {
    const upload = await uploadCover(sb, parsed.cover);
    if (!upload.ok) return upload;
    coverUrl = upload.publicUrl;
  }

  const { data, error } = await sb
    .from("amb_events")
    .insert({
      title: parsed.title,
      body: parsed.body,
      cover_image_url: coverUrl,
      created_by: gate.profileId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }

  revalidatePath("/admin/events");
  revalidatePath("/dashboard/events");
  redirect("/admin/events");
}

// ---------- update -----------------------------------------------------------

export async function updateEvent(
  id: string,
  _prev: EventFormResult | null,
  formData: FormData,
): Promise<EventFormResult | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const parsed = parseEventForm(formData);
  if (!parsed.ok) return parsed;

  const sb = createAdminClient();

  const removeCover = formData.get("remove_cover") === "on";
  const update: EventUpdate = {
    title: parsed.title,
    body: parsed.body,
  };
  if (parsed.cover) {
    const upload = await uploadCover(sb, parsed.cover);
    if (!upload.ok) return upload;
    update.cover_image_url = upload.publicUrl;
  } else if (removeCover) {
    update.cover_image_url = null;
  }

  const { error } = await sb.from("amb_events").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${id}`);
  revalidatePath("/dashboard/events");
  return { ok: true };
}

// ---------- delete -----------------------------------------------------------

export async function deleteEvent(id: string) {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false as const, error: "Not authorized." };

  const sb = createAdminClient();
  const { error } = await sb.from("amb_events").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/admin/events");
  revalidatePath("/dashboard/events");
  return { ok: true as const };
}

// ---------- helpers ---------------------------------------------------------

type ParseError = { ok: false; error: string };
type ParsedEvent =
  | { ok: true; title: string; body: string; cover: File | null }
  | ParseError;

function parseEventForm(formData: FormData): ParsedEvent {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const cover = formData.get("cover_image");

  if (!title || title.length > 200) {
    return { ok: false, error: "Title is required (max 200 chars)." };
  }
  if (!body) {
    return { ok: false, error: "Body is required." };
  }

  let coverFile: File | null = null;
  if (cover instanceof File && cover.size > 0) {
    if (cover.size > COVER_MAX_BYTES) {
      return { ok: false, error: "Cover image must be 5 MB or smaller." };
    }
    if (!COVER_MIME.includes(cover.type as (typeof COVER_MIME)[number])) {
      return { ok: false, error: "Cover image must be JPEG, PNG, or WebP." };
    }
    coverFile = cover;
  }

  return { ok: true, title, body, cover: coverFile };
}

async function uploadCover(
  sb: ReturnType<typeof createAdminClient>,
  file: File,
): Promise<{ ok: true; publicUrl: string } | ParseError> {
  const ext =
    file.name.split(".").pop()?.toLowerCase() ??
    (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg");
  const month = new Date().toISOString().slice(0, 7);
  const path = `${month}/${randomUUID()}.${ext}`;

  const { error } = await sb.storage
    .from(COVER_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) return { ok: false, error: `Cover upload failed: ${error.message}` };

  const { data } = sb.storage.from(COVER_BUCKET).getPublicUrl(path);
  return { ok: true, publicUrl: data.publicUrl };
}
