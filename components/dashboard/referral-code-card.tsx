"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function ReferralCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (insecure context / permissions).
      // Fail silently — the code is visible for manual copy regardless.
    }
  }

  return (
    <div className="rounded-2xl bg-paper-2 ring-1 ring-line px-4 py-3 flex items-center gap-4 shrink-0 self-start">
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-mute font-semibold">
          Your referral code
        </div>
        <div className="font-mono font-bold text-navy-900 text-[18px] tracking-[0.15em] mt-0.5">
          {code}
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        title="Share this code with friends who apply to the Yuvaah Club"
        className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 text-[12px] font-semibold rounded-full bg-navy-900 hover:bg-navy-800 text-white shrink-0"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
