/**
 * Service-role Supabase client. Bypasses RLS.
 *
 * SERVER ONLY. Importing this file from a Client Component will throw at
 * build time because process.env.SUPABASE_SECRET_KEY is not exposed to the
 * browser bundle. Use exclusively from Route Handlers, Server Actions, and
 * (eventually) Edge Functions migrated out of /supabase/functions.
 */
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

let cached: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createAdminClient() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SECRET_KEY must be set for the admin client.",
    );
  }

  cached = createSupabaseClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cached;
}
