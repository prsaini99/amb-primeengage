/**
 * Server Supabase client (Server Components, Route Handlers, Server Actions).
 *
 * Uses the publishable key + cookies so RLS evaluates against the signed-in
 * user. For service-role access (bypasses RLS) use lib/supabase/admin.ts.
 *
 * Cookie writes:
 *  - Server Components cannot mutate cookies; the try/catch in setAll
 *    swallows the error. proxy.ts handles the canonical session-refresh
 *    case on the next request, so this fallback rarely triggers.
 *  - Route Handlers and Server Actions can mutate cookies — those writes
 *    succeed. The Cache-Control headers passed by @supabase/ssr 0.10's
 *    setAll contract are intentionally ignored here: there's no portable
 *    way to set response headers from a Server Component, and proxy.ts
 *    already applies them on the request boundary where it matters.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(({ name, value }) => ({
            name,
            value,
          }));
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies; proxy.ts handles refresh.
          }
        },
      },
    },
  );
}
