/**
 * Next 16 Proxy (formerly middleware) — role-based route protection.
 *
 * Reads the Supabase session from cookies and the role from JWT app_metadata.
 * Never hits the database. Role is set on the auth user when:
 *   - the admin is seeded (one-shot via `npm run seed:admin`)
 *   - an applicant is approved by /api/admin/applications/[id]/approve
 *
 * Rules:
 *   - unauthenticated user touching /admin/* or /dashboard/* → /login
 *   - non-admin touching /admin/*                          → /dashboard
 *   - admin touching /dashboard/*                          → /admin/applications
 *   - any other path                                      → passthrough
 *
 * Cache-Control headers ensure the response (which may carry refreshed auth
 * cookies) is never cached by a CDN or reverse proxy. Required by
 * @supabase/ssr 0.10's setAll callback contract.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const ADMIN_PREFIX = "/admin";
const DASHBOARD_PREFIX = "/dashboard";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith(ADMIN_PREFIX);
  const isDashboardRoute = pathname.startsWith(DASHBOARD_PREFIX);
  if (!isAdminRoute && !isDashboardRoute) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll().map(({ name, value }) => ({
            name,
            value,
          }));
        },
        setAll(cookiesToSet, headers) {
          // Recreate the response so cookies committed during a session
          // refresh propagate to the rendered page.
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() contacts the Auth server and verifies the JWT.
  // getSession() is unverified. Always use getUser() in trust-bearing paths.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  const role = (user.app_metadata as { role?: string } | null)?.role;

  if (isAdminRoute && role !== "admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  if (isDashboardRoute && role === "admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/applications";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"],
};
