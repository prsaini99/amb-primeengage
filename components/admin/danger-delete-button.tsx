"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

/**
 * Reusable confirm + delete button. The action is a Server Action that
 * returns { ok: true } | { ok: false, error: string } and either redirects
 * after success (caller passes redirectTo) or refreshes the current route.
 */
export function DangerDeleteButton({
  action,
  confirmMessage,
  label = "Delete",
  busyLabel = "Deleting…",
  redirectTo,
  size = "md",
}: {
  action: () => Promise<{ ok: true } | { ok: false; error: string }>;
  confirmMessage: string;
  label?: string;
  busyLabel?: string;
  redirectTo?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  const sizeCls =
    size === "sm"
      ? "h-8 px-3 text-[12.5px]"
      : "h-10 px-4 text-[13px]";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={
          "inline-flex items-center justify-center gap-2 rounded-full bg-paper-2 text-amber-500 ring-1 ring-amber-500/40 hover:bg-amber-500/10 transition-all disabled:opacity-60 font-semibold " +
          sizeCls
        }
      >
        <Trash2 size={size === "sm" ? 12 : 14} />
        {pending ? busyLabel : label}
      </button>
      {error && <p className="text-[12.5px] text-amber-500">{error}</p>}
    </div>
  );
}
