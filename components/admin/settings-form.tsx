"use client";

import { useActionState } from "react";
import { AlertCircle, Save } from "lucide-react";

import { updatePointsRate, type SettingsResult } from "@/app/actions/settings";

export function SettingsForm({ initialRate }: { initialRate: number }) {
  const [state, action, pending] = useActionState<
    SettingsResult | null,
    FormData
  >(updatePointsRate, null);

  return (
    <form action={action} className="space-y-5">
      <label className="block">
        <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
          Points-to-INR rate
        </span>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[13px] text-mute">1 point ≈ ₹</span>
          <input
            name="points_to_inr_rate"
            type="number"
            min="0.001"
            max="1000"
            step="0.001"
            required
            defaultValue={initialRate}
            disabled={pending}
            suppressHydrationWarning
            className="w-32 rounded-xl bg-paper-2 ring-1 ring-line px-4 py-3 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
          />
        </div>
        <p className="text-[12.5px] text-mute mt-2">
          Display value only — not enforced on individual products. Each product
          carries its own absolute <code>points_cost</code> and <code>inr_cost</code>.
          The rate exists so the UI can suggest "1 point = ₹X" or "this is roughly
          worth ₹Y".
        </p>
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
        className="inline-flex items-center justify-center gap-2 h-11 px-5 text-[13.5px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft disabled:opacity-60"
      >
        <Save size={15} />
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
