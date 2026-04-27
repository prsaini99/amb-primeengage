"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export type SettingsResult = { ok: false; error: string };

/**
 * Updates the global points_to_inr_rate (tech doc §4.11). The rate is a
 * display / reference value — it does NOT alter products' explicit
 * points_cost / inr_cost fields. The rate lets the UI suggest "1 point ≈
 * ₹X" wherever it's helpful (e.g., the store filter "show only items I can
 * afford with ₹X").
 */
export async function updatePointsRate(
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const raw = String(formData.get("points_to_inr_rate") ?? "").trim();
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) {
    return {
      ok: false,
      error: "Rate must be a positive number (₹ per point), up to 1000.",
    };
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("amb_settings")
    .upsert(
      { key: "points_to_inr_rate", value: rate, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  return null;
}
