"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Trash2, Zap, ZapOff } from "lucide-react";
import { useRouter } from "next/navigation";

import type { RoundFormResult } from "@/app/actions/quizzes";

export function ActivateButton({
  id,
  onActivate,
}: {
  id: string;
  onActivate: (id: string) => Promise<RoundFormResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RoundFormResult | null>(null);

  function handleClick() {
    startTransition(async () => {
      const res = await onActivate(id);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="inline-flex items-center gap-2 h-10 px-5 text-[13px] font-semibold rounded-full bg-cyan-500 hover:bg-cyan-400 text-white disabled:opacity-60"
      >
        <Zap size={14} />
        {isPending ? "Activating…" : "Activate round"}
      </button>

      {result && !result.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{result.error}</span>
        </div>
      )}
      {result && result.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-cyan-500 bg-cyan-50 rounded-xl px-4 py-3 ring-1 ring-cyan-300/60">
          <Check size={16} className="mt-0.5 shrink-0" />
          <span>Round activated.</span>
        </div>
      )}
    </div>
  );
}

export function DeactivateButton({
  id,
  onDeactivate,
}: {
  id: string;
  onDeactivate: (id: string) => Promise<RoundFormResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RoundFormResult | null>(null);

  function handleClick() {
    startTransition(async () => {
      const res = await onDeactivate(id);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="inline-flex items-center gap-2 h-10 px-5 text-[13px] font-semibold rounded-full bg-red-600 hover:bg-red-500 text-white disabled:opacity-60"
      >
        <ZapOff size={14} />
        {isPending ? "Deactivating…" : "Deactivate (close) round"}
      </button>

      {result && !result.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{result.error}</span>
        </div>
      )}
      {result && result.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-cyan-500 bg-cyan-50 rounded-xl px-4 py-3 ring-1 ring-cyan-300/60">
          <Check size={16} className="mt-0.5 shrink-0" />
          <span>Round deactivated (closed).</span>
        </div>
      )}
    </div>
  );
}

export function DeleteRoundButton({
  id,
  participantCount,
  onDelete,
}: {
  id: string;
  participantCount: number;
  onDelete: (id: string) => Promise<RoundFormResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RoundFormResult | null>(null);

  function handleClick() {
    const msg =
      participantCount > 0
        ? `Delete this quiz? It has ${participantCount} participant${participantCount === 1 ? "" : "s"} — their attempt records will be removed (points already credited are kept). This cannot be undone.`
        : "Delete this quiz? This removes its question pool and cannot be undone.";
    if (!window.confirm(msg)) return;
    startTransition(async () => {
      const res = await onDelete(id);
      setResult(res);
      if (res.ok) router.push("/admin/quizzes");
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-mute leading-relaxed">
        Permanently removes this quiz, its question pool, and all attempt
        records. Points already credited to members are kept. This cannot be
        undone.
      </p>

      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="inline-flex items-center gap-2 h-10 px-5 text-[13px] font-semibold rounded-full bg-red-600 hover:bg-red-500 text-white disabled:opacity-60"
      >
        <Trash2 size={14} />
        {isPending ? "Deleting…" : "Delete quiz"}
      </button>

      {result && !result.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{result.error}</span>
        </div>
      )}
    </div>
  );
}
