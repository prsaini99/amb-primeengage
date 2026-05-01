"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Inbox } from "lucide-react";

import { setActivityActive } from "@/app/actions/activities";

export function ActivityArchiveButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const action = isActive ? "Archive" : "Reactivate";
    if (
      !window.confirm(
        isActive
          ? "Archive this activity? Yuvaah Club members will not see it and the trigger will reject any new submissions."
          : "Reactivate this activity?",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await setActivityActive(id, !isActive);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      // visual feedback
      console.info(`${action}d.`);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={
          "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full text-[13px] font-semibold transition-all disabled:opacity-60 " +
          (isActive
            ? "bg-paper-2 text-navy-800 ring-1 ring-line-strong hover:ring-navy-800"
            : "bg-amber-500 text-white hover:bg-amber-400 shadow-soft")
        }
      >
        {isActive ? <Archive size={14} /> : <Inbox size={14} />}
        {pending
          ? isActive ? "Archiving…" : "Reactivating…"
          : isActive ? "Archive activity" : "Reactivate"}
      </button>
      {error && (
        <p className="text-[12.5px] text-amber-500">{error}</p>
      )}
    </div>
  );
}
