"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, X } from "lucide-react";

type Result = { ok: true } | { ok: false; error: string };

export function ApplicationActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<"approve" | "reject" | null>(
    null,
  );
  const [result, setResult] = useState<Result | null>(null);

  function run(action: "approve" | "reject") {
    if (
      action === "reject" &&
      !window.confirm("Reject this application? The applicant will be emailed.")
    ) {
      return;
    }
    setActiveAction(action);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/applications/${id}/${action}`, {
          method: "POST",
        });
        const json = (await res.json()) as
          | { ok: true; warning?: string }
          | { error: string };
        if (!res.ok || "error" in json) {
          setResult({
            ok: false,
            error: "error" in json ? json.error : `HTTP ${res.status}`,
          });
          return;
        }
        setResult({ ok: true });
        router.refresh();
      } catch (err) {
        setResult({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => run("approve")}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 text-[13.5px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft transition-all disabled:opacity-60"
        >
          <Check size={15} />
          {pending && activeAction === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run("reject")}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 text-[13.5px] font-semibold rounded-full bg-paper-2 text-navy-800 ring-1 ring-line-strong hover:ring-navy-800 transition-all disabled:opacity-60"
        >
          <X size={15} />
          {pending && activeAction === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>

      {result && !result.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{result.error}</span>
        </div>
      )}
      {result && result.ok && (
        <div className="text-[13px] text-cyan-500 bg-cyan-50 rounded-xl px-4 py-3 ring-1 ring-cyan-300/60">
          Done. Refreshing…
        </div>
      )}
    </div>
  );
}
