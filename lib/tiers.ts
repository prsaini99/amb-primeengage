import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Shape of a row returned by the public.amb_user_tier(uuid) Postgres
 * function. Numeric columns come back as strings from PostgREST; the
 * helper coerces points_to_inr_rate to a JS number before handing the
 * row to callers so UI / pricing math doesn't have to special-case it.
 *
 * lifetime_earned   = sum of submission_awarded + award_adjustment ledger
 *                     deltas (the "Total earned" metric).
 * next_threshold    = threshold of the next tier up, or null when the
 *                     user has hit the top tier.
 */
export type UserTier = {
  rank: number;
  name: string;
  threshold_points: number;
  points_to_inr_rate: number;
  lifetime_earned: number;
  next_threshold: number | null;
};

type SbWithTierRpc = {
  rpc: (
    fn: "amb_user_tier",
    args: { p_user_id: string },
  ) => Promise<{
    data:
      | Array<{
          tier_rank: number;
          tier_name: string;
          tier_threshold_points: number;
          tier_points_to_inr_rate: number | string;
          lifetime_earned: number;
          next_threshold: number | null;
        }>
      | null;
    error: { message: string } | null;
  }>;
};

export async function getUserTier(
  sb: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<UserTier | null> {
  const { data, error } = await (sb as unknown as SbWithTierRpc).rpc(
    "amb_user_tier",
    { p_user_id: userId },
  );
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return {
    rank: row.tier_rank,
    name: row.tier_name,
    threshold_points: row.tier_threshold_points,
    points_to_inr_rate: Number(row.tier_points_to_inr_rate),
    lifetime_earned: row.lifetime_earned,
    next_threshold: row.next_threshold,
  };
}
