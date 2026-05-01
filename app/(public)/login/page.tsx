import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Yuvaah Platform" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // If a session already exists, bounce to the role-default landing so
  // signed-in users don't see the form. Proxy.ts also bounces the other
  // way (signed-out user touching /admin/* or /dashboard/* → /login).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const role = (user.app_metadata as { role?: string } | null)?.role;
    redirect(role === "admin" ? "/admin/applications" : "/dashboard");
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center">
          <Logo size={96} />
        </div>

        <div className="mt-8 rounded-[28px] bg-paper-2 ring-1 ring-line p-7 md:p-10 shadow-soft">
          <h1 className="font-display text-3xl font-bold text-navy-900">
            Yuvaah Platform
          </h1>
          <p className="text-[13.5px] text-mute mt-1">
            Sign in with the credentials sent to your email after approval. Admins,
            use your seeded credentials.
          </p>

          <div className="mt-7">
            <LoginForm />
          </div>
        </div>

        <p className="mt-6 text-center text-[12px] text-mute">
          © {new Date().getFullYear()} Prime Engage.
        </p>
      </div>
    </div>
  );
}
