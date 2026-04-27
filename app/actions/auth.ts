"use server";

/**
 * Auth server actions.
 *
 * signIn — called from the /login form via useActionState. On success,
 * Supabase persists the session via our server.ts setAll (cookieStore.set
 * works inside a Server Action), then we redirect to the role-default
 * landing. Errors flow back as a typed result the form can render.
 *
 * signOut — invoked from the admin layout sidebar's logout form (and later
 * the ambassador dashboard).
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignInResult = { ok: false; error: string };

export async function signIn(
  _prev: SignInResult | null,
  formData: FormData,
): Promise<SignInResult | null> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Supabase returns "Invalid login credentials" for both wrong-password
    // and unknown-email by design — leak nothing more.
    return { ok: false, error: error.message };
  }
  if (!data.user) {
    return { ok: false, error: "Sign-in failed. Please try again." };
  }

  const role = (data.user.app_metadata as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "ambassador") {
    // Auth user exists but has no role assigned — only happens for users
    // created outside our seed/approve flows (e.g. someone manually added
    // via Dashboard without setting app_metadata.role).
    return {
      ok: false,
      error:
        "Your account has no role assigned. Contact the platform admin.",
    };
  }

  // redirect() throws a special signal Server Actions handle as navigation.
  // Cookies set during signInWithPassword are committed to the response on
  // the way out.
  redirect(role === "admin" ? "/admin/applications" : "/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
