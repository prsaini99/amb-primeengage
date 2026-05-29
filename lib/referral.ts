import "server-only";

import { randomInt } from "node:crypto";

import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Per-Yuvaah referral code generation.
 *
 * Codes are 6 chars from an unambiguous uppercase alphabet (no 0/O/1/I/L)
 * so they're easy to read aloud and transcribe. ~32^6 ≈ 1.07 billion
 * combinations, so collisions are vanishingly rare — but we still check
 * against the DB and retry, and the unique index on upper(referral_code)
 * is the final guard.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 chars: no 0,1,O,I,L
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 8;

export function generateReferralCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

/**
 * Generate a code that isn't already taken (case-insensitive). Returns null
 * only if every attempt collided — astronomically unlikely at this scale,
 * but the caller should handle it rather than loop forever.
 */
export async function generateUniqueReferralCode(
  sb: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateReferralCode();
    const { data } = await sb
      .from("amb_profiles")
      .select("id")
      .ilike("referral_code", code)
      .maybeSingle();
    if (!data) return code;
  }
  return null;
}
