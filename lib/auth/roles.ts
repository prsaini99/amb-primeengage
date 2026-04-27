/**
 * Single source of truth for role + status string literals used across the
 * platform. Keep these aligned with amb_profiles.role and amb_profiles.status
 * column constraints.
 */
export const ROLES = ["admin", "ambassador"] as const;
export type Role = (typeof ROLES)[number];

export const PROFILE_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "suspended",
] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export function isAdmin(role: string | null | undefined): role is "admin" {
  return role === "admin";
}
