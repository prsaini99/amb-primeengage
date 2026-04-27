"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type ActivityUpdate = Database["public"]["Tables"]["amb_activities"]["Update"];

const COVER_BUCKET = "amb_activities";
const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export type ActivityFormResult = { ok: false; error: string };

// ---------- create -----------------------------------------------------------

export async function createActivity(
  _prev: ActivityFormResult | null,
  formData: FormData,
): Promise<ActivityFormResult | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const parsed = parseActivityForm(formData);
  if (!parsed.ok) return parsed;

  const sb = createAdminClient();

  // Cover upload (optional). Path: <yyyy-mm>/<uuid>.<ext> per tech doc §7.
  let coverUrl: string | null = null;
  if (parsed.cover) {
    const upload = await uploadCover(sb, parsed.cover);
    if (!upload.ok) return upload;
    coverUrl = upload.publicUrl;
  }

  const { data, error } = await sb
    .from("amb_activities")
    .insert({
      title: parsed.title,
      description: parsed.description,
      points: parsed.points,
      submission_deadline: parsed.deadline,
      cover_image_url: coverUrl,
      created_by: gate.profileId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }

  revalidatePath("/admin/activities");
  redirect(`/admin/activities/${data.id}`);
}

// ---------- update -----------------------------------------------------------

export async function updateActivity(
  id: string,
  _prev: ActivityFormResult | null,
  formData: FormData,
): Promise<ActivityFormResult | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const parsed = parseActivityForm(formData);
  if (!parsed.ok) return parsed;

  const sb = createAdminClient();

  // Cover handling:
  //   - "remove_cover" checkbox set → wipe cover_image_url to null
  //   - new file uploaded            → upload + replace
  //   - neither                      → leave cover_image_url alone
  const removeCover = formData.get("remove_cover") === "on";
  const update: ActivityUpdate = {
    title: parsed.title,
    description: parsed.description,
    points: parsed.points,
    submission_deadline: parsed.deadline,
  };
  if (parsed.cover) {
    const upload = await uploadCover(sb, parsed.cover);
    if (!upload.ok) return upload;
    update.cover_image_url = upload.publicUrl;
  } else if (removeCover) {
    update.cover_image_url = null;
  }

  const { error } = await sb.from("amb_activities").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/activities");
  revalidatePath(`/admin/activities/${id}`);
  return null; // caller refreshes via router; useActionState clears the error
}

// ---------- archive / unarchive ---------------------------------------------

export async function setActivityActive(id: string, isActive: boolean) {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false as const, error: "Not authorized." };

  const sb = createAdminClient();
  const { error } = await sb
    .from("amb_activities")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/admin/activities");
  revalidatePath(`/admin/activities/${id}`);
  return { ok: true as const };
}

// ---------- helpers ---------------------------------------------------------

type ParsedActivity =
  | {
      ok: true;
      title: string;
      description: string;
      points: number;
      deadline: string; // ISO with TZ
      cover: File | null;
    }
  | ActivityFormResult;

function parseActivityForm(formData: FormData): ParsedActivity {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const pointsRaw = String(formData.get("points") ?? "").trim();
  const deadlineRaw = String(formData.get("submission_deadline") ?? "").trim();
  const cover = formData.get("cover_image");

  if (!title || title.length > 200) {
    return { ok: false, error: "Title is required (max 200 chars)." };
  }
  if (!description) {
    return { ok: false, error: "Description is required." };
  }
  const points = Number(pointsRaw);
  if (!Number.isInteger(points) || points < 0 || points > 100000) {
    return { ok: false, error: "Points must be a whole number between 0 and 100,000." };
  }

  // <input type="datetime-local"> returns "YYYY-MM-DDTHH:mm" without TZ;
  // browsers interpret it as local time. new Date() does the same, so
  // .toISOString() produces a UTC ISO string consistent with the user's intent.
  if (!deadlineRaw) {
    return { ok: false, error: "Submission deadline is required." };
  }
  const deadline = new Date(deadlineRaw);
  if (Number.isNaN(deadline.getTime())) {
    return { ok: false, error: "Submission deadline is invalid." };
  }
  if (deadline.getTime() <= Date.now()) {
    return { ok: false, error: "Submission deadline must be in the future." };
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

  return {
    ok: true,
    title,
    description,
    points,
    deadline: deadline.toISOString(),
    cover: coverFile,
  };
}

async function uploadCover(
  sb: ReturnType<typeof createAdminClient>,
  file: File,
): Promise<{ ok: true; publicUrl: string } | ActivityFormResult> {
  const ext =
    file.name.split(".").pop()?.toLowerCase() ??
    (file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg");
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
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
