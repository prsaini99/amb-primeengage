"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";

import { updateTiers, type TiersResult } from "@/app/actions/tiers";

export type TierRow = {
  rank: number;
  name: string;
  threshold_points: number;
  points_to_inr_rate: number;
};

export function TiersForm({ initialTiers }: { initialTiers: TierRow[] }) {
  const [state, action, pending] = useActionState<
    TiersResult | null,
    FormData
  >(updateTiers, null);

  return (
    <form action={action} className="space-y-6">
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line overflow-hidden">
        <table className="w-full text-[13.5px]">
          <thead className="bg-paper">
            <tr className="text-left text-[11.5px] uppercase tracking-[0.16em] text-mute font-semibold">
              <th className="px-4 py-3 w-16">Rank</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 w-44">Threshold (lifetime pts)</th>
              <th className="px-4 py-3 w-44">Rate (₹ per point)</th>
            </tr>
          </thead>
          <tbody>
            {initialTiers.map((t, i) => (
              <tr
                key={t.rank}
                className={i === 0 ? "" : "border-t border-line"}
              >
                <td className="px-4 py-4">
                  <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/10 text-amber-500 font-display font-bold">
                    {t.rank}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <input
                    name={`tier_${t.rank}_name`}
                    type="text"
                    required
                    maxLength={64}
                    defaultValue={t.name}
                    disabled={pending}
                    suppressHydrationWarning
                    className="w-full rounded-xl bg-paper ring-1 ring-line px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                  />
                </td>
                <td className="px-4 py-4">
                  <input
                    name={`tier_${t.rank}_threshold_points`}
                    type="number"
                    min={t.rank === 1 ? 0 : 1}
                    max={10_000_000}
                    step={1}
                    required
                    defaultValue={t.threshold_points}
                    disabled={pending || t.rank === 1}
                    title={
                      t.rank === 1
                        ? "Tier 1 threshold is fixed at 0 so every new member qualifies."
                        : undefined
                    }
                    suppressHydrationWarning
                    className="no-spinner w-full rounded-xl bg-paper ring-1 ring-line px-3 py-2 text-[14px] font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                  />
                  {/* When the input is disabled, the browser doesn't include
                      it in form submission. Mirror the value via a hidden
                      input so the server still gets tier_1_threshold_points=0. */}
                  {t.rank === 1 && (
                    <input
                      type="hidden"
                      name="tier_1_threshold_points"
                      value="0"
                    />
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] text-mute">₹</span>
                    <input
                      name={`tier_${t.rank}_points_to_inr_rate`}
                      type="number"
                      min={0.001}
                      max={1000}
                      step={0.001}
                      required
                      defaultValue={t.points_to_inr_rate}
                      disabled={pending}
                      suppressHydrationWarning
                      className="no-spinner w-full rounded-xl bg-paper ring-1 ring-line px-3 py-2 text-[14px] font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state && !state.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
      {state && state.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-cyan-500 bg-cyan-50 rounded-xl px-4 py-3 ring-1 ring-cyan-300/60">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>Tiers saved.</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 h-11 px-5 text-[13.5px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft disabled:opacity-60"
      >
        <Save size={15} />
        {pending ? "Saving…" : "Save tiers"}
      </button>
    </form>
  );
}
