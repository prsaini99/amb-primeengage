"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Save } from "lucide-react";

import { setReferralCode, type ReferralResult } from "@/app/actions/referral";

export function ReferralCodeEditor({
  profileId,
  initialCode,
}: {
  profileId: string;
  initialCode: string | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode ?? "");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReferralResult | null>(null);

  const dirty = code.trim().toUpperCase() !== (initialCode ?? "").toUpperCase();

  function save() {
    setResult(null);
    startTransition(async () => {
      const res = await setReferralCode(profileId, code);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          disabled={pending}
          placeholder="e.g. 7K2M9P"
          maxLength={32}
          spellCheck={false}
          suppressHydrationWarning
          className="flex-1 rounded-xl bg-paper ring-1 ring-line px-3 py-2 text-[14px] font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="inline-flex items-center justify-center gap-1.5 h-10 px-4 text-[12.5px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={14} />
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      {result && !result.ok && (
        <div className="flex items-start gap-2 text-[12.5px] text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2 ring-1 ring-amber-500/30">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{result.error}</span>
        </div>
      )}
      {result && result.ok && (
        <div className="flex items-center gap-2 text-[12.5px] text-cyan-500 bg-cyan-50 rounded-lg px-3 py-2 ring-1 ring-cyan-300/60">
          <Check size={14} className="shrink-0" />
          <span>{code.trim() ? "Referral code saved." : "Referral code cleared."}</span>
        </div>
      )}

      <p className="text-[11.5px] text-mute leading-relaxed">
        Auto-generated on approval. Edit to match a code you handed out
        manually, or clear it to leave blank. Must be unique across all
        members.
      </p>
    </div>
  );
}
