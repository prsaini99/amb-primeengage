/**
 * Browser Supabase client.
 *
 * Use inside Client Components only. Reads the publishable key from
 * NEXT_PUBLIC_* env vars (safe to expose). Session lives in cookies via the
 * @supabase/ssr helper so server components can read the same session.
 */
import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
