"use client";

import { useActionState } from "react";
import { AlertCircle, Lock } from "lucide-react";

import { signIn, type SignInResult } from "@/app/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<
    SignInResult | null,
    FormData
  >(signIn, null);

  return (
    <form action={action} className="space-y-5">
      <label className="block">
        <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
          Email
        </span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          // Suppress benign hydration mismatches from form-touching browser
          // extensions (Temp Mail, password managers, Grammarly, etc.).
          suppressHydrationWarning
          className="w-full mt-2 rounded-xl bg-paper ring-1 ring-line px-4 py-3 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
        />
      </label>
      <label className="block">
        <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
          Password
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          suppressHydrationWarning
          className="w-full mt-2 rounded-xl bg-paper ring-1 ring-line px-4 py-3 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
        />
      </label>

      {state && !state.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 h-12 px-6 text-[14px] font-semibold rounded-full bg-navy-900 hover:bg-navy-800 text-white transition-all disabled:opacity-60"
      >
        <Lock size={15} />
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
