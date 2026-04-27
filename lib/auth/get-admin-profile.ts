import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Returns the admin amb_profiles row. Phase 1 has exactly one admin (the
 * seeded one), so we just pick the first row with role='admin'. When
 * multi-admin lands in Phase 4 this needs to become a per-conversation
 * lookup or a "default admin" setting.
 *
 * Cached per server-component render via React's request memoization is NOT
 * needed for Phase 1 — the few callers each do one lookup per request.
 */
export async function getAdminProfile(): Promise<{
  id: string;
  first_name: string;
  last_name: string;
} | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("amb_profiles")
    .select("id, first_name, last_name")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}
