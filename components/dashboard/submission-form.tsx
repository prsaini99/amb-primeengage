"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Send } from "lucide-react";

export function SubmissionForm({ activityId }: { activityId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        setProgress("Saving submission…");
        const commitRes = await fetch("/api/dashboard/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activity_id: activityId,
            text_content: text.trim() || undefined,
          }),
        });
        const commitJson = (await commitRes.json()) as
          | { ok: true; submission_id: string }
          | { error: string };
        if (!commitRes.ok || "error" in commitJson) {
          setError("error" in commitJson ? commitJson.error : `HTTP ${commitRes.status}`);
          setProgress(null);
          return;
        }

        setProgress(null);
        router.refresh(); // Re-render the activity detail with submitted state
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setProgress(null);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
          Notes (optional)
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={4000}
          disabled={pending}
          placeholder="Anything we should know about your submission?"
          suppressHydrationWarning
          className="w-full mt-2 rounded-xl bg-paper-2 ring-1 ring-line px-4 py-3 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 resize-y"
        />
      </label>

      {error && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {progress && !error && (
        <div className="text-[13px] text-cyan-500 bg-cyan-50 rounded-xl px-4 py-3 ring-1 ring-cyan-300/60">
          {progress}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 h-12 px-6 text-[14px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft transition-all disabled:opacity-60"
        >
          <Send size={15} />
          {pending ? "Submitting…" : "Submit"}
        </button>
        <p className="mt-3 text-[12px] text-mute">
          Submissions lock immediately on save — no edits or resubmits.
        </p>
      </div>
    </form>
  );
}
