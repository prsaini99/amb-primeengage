"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export type TiersResult = { ok: false; error: string } | { ok: true };

type TierInput = {
  rank: number;
  name: string;
  threshold_points: number;
  points_to_inr_rate: number;
};

/**
 * Bulk-update all five tiers in one shot. The form posts every row's
 * fields with `tier_<rank>_<field>` names; we parse, validate the
 * cross-row invariants (rank 1 threshold = 0, strictly increasing
 * thresholds), then upsert. Doing it bulk lets the admin reorder
 * thresholds without ever passing through an invalid intermediate state.
 */
export async function updateTiers(
  _prev: TiersResult | null,
  formData: FormData,
): Promise<TiersResult | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const tiers: TierInput[] = [];
  for (let rank = 1; rank <= 5; rank++) {
    const name = String(formData.get(`tier_${rank}_name`) ?? "").trim();
    const thresholdRaw = String(
      formData.get(`tier_${rank}_threshold_points`) ?? "",
    ).trim();
    const rateRaw = String(
      formData.get(`tier_${rank}_points_to_inr_rate`) ?? "",
    ).trim();

    if (!name || name.length > 64) {
      return { ok: false, error: `Tier ${rank}: name is required (max 64 chars).` };
    }
    const threshold = Number(thresholdRaw);
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 10_000_000) {
      return {
        ok: false,
        error: `Tier ${rank}: threshold must be a whole number between 0 and 10,000,000.`,
      };
    }
    const rate = Number(rateRaw);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) {
      return {
        ok: false,
        error: `Tier ${rank}: rate must be a positive number up to 1000.`,
      };
    }
    tiers.push({ rank, name, threshold_points: threshold, points_to_inr_rate: rate });
  }

  // Tier 1 must start at 0 — otherwise newly-approved members fall into a
  // tier-less hole and the hybrid checkout can't price them.
  if (tiers[0].threshold_points !== 0) {
    return {
      ok: false,
      error: "Tier 1 threshold must be 0 — every new member must qualify for the lowest tier.",
    };
  }

  // Strictly increasing thresholds. Equal thresholds would make the
  // amb_user_tier() resolution non-deterministic at the boundary.
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].threshold_points <= tiers[i - 1].threshold_points) {
      return {
        ok: false,
        error: `Tier ${tiers[i].rank} threshold (${tiers[i].threshold_points}) must be greater than Tier ${tiers[i - 1].rank} threshold (${tiers[i - 1].threshold_points}).`,
      };
    }
  }

  const sb = createAdminClient();
  const nowIso = new Date().toISOString();
  const { error } = await sb.from("amb_tiers").upsert(
    tiers.map((t) => ({ ...t, updated_at: nowIso })),
    { onConflict: "rank" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/tiers");
  // Dashboard headers + store detail pages are tier-derived, so dump their caches too.
  revalidatePath("/dashboard");
  return { ok: true };
}
