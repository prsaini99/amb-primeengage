"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Award, Pencil } from "lucide-react";

type Mode = "award" | "adjust";

const MODE_CONFIG: Record<
  Mode,
  {
    endpoint: (id: string) => string;
    confirmVerb: string;
    submitLabel: string;
    submittingLabel: string;
    Icon: typeof Award;
    confirmTail: string;
  }
> = {
  award: {
    endpoint: (id) => `/api/admin/submissions/${id}/award`,
    confirmVerb: "Award",
    submitLabel: "Award points",
    submittingLabel: "Awarding…",
    Icon: Award,
    confirmTail: " This is one-shot — but you can adjust later from the awarded card.",
  },
  adjust: {
    endpoint: (id) => `/api/admin/submissions/${id}/adjust-award`,
    confirmVerb: "Update award to",
    submitLabel: "Save adjustment",
    submittingLabel: "Saving…",
    Icon: Pencil,
    confirmTail: " The change appends an admin_adjustment ledger entry; original award stays in the audit trail.",
  },
};

export function AwardForm({
  submissionId,
  defaultPoints,
  mode = "award",
}: {
  submissionId: string;
  defaultPoints: number;
  mode?: Mode;
}) {
  const router = useRouter();
  const cfg = MODE_CONFIG[mode];
  // String state instead of number — controlled `<input type="number">` with a
  // numeric value drops user-typed leading zeros silently (React skips the
  // DOM update when Number(typed) === currentState). String state keeps what
  // the user typed visible verbatim; we parse + validate at submit time.
  const [pointsStr, setPointsStr] = useState(String(defaultPoints));
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function parsePoints(): number | null {
    if (pointsStr.trim() === "") return null;
    const n = Number(pointsStr);
    if (!Number.isInteger(n) || n < 0 || n > 100000) return null;
    return n;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const points = parsePoints();
    if (points === null) {
      setError("Enter a whole number between 0 and 100,000.");
      return;
    }
    if (
      !window.confirm(
        `${cfg.confirmVerb} ${points} point${points === 1 ? "" : "s"}?${cfg.confirmTail}`,
      )
    ) {
      return;
    }
    setError(null);
    setWarning(null);
    startTransition(async () => {
      try {
        const res = await fetch(cfg.endpoint(submissionId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points }),
        });
        const raw = await res.text();
        let json: { ok?: true; warning?: string; error?: string } = {};
        if (raw) {
          try {
            json = JSON.parse(raw);
          } catch {
            setError(`HTTP ${res.status}: ${raw.slice(0, 200)}`);
            return;
          }
        }
        if (!res.ok || json.error) {
          setError(json.error ?? `HTTP ${res.status} with empty body.`);
          return;
        }
        if (json.warning) setWarning(json.warning);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
          {mode === "award" ? "Points to award" : "New point total"}
        </span>
        <input
          type="number"
          min={0}
          max={100000}
          step={1}
          required
          value={pointsStr}
          onChange={(e) => setPointsStr(e.target.value)}
          disabled={pending}
          suppressHydrationWarning
          className="w-full mt-2 rounded-xl bg-paper ring-1 ring-line px-4 py-3 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
        />
        <span className="text-[12px] text-mute mt-1.5 block">
          {mode === "award"
            ? `Default for this activity: ${defaultPoints}. Override at your discretion.`
            : `Currently awarded: ${defaultPoints}. The difference is recorded as an admin adjustment.`}
        </span>
      </label>

      {error && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {warning && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{warning}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 h-11 px-5 text-[13.5px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft transition-all disabled:opacity-60"
      >
        <cfg.Icon size={15} />
        {pending ? cfg.submittingLabel : cfg.submitLabel}
      </button>
    </form>
  );
}
