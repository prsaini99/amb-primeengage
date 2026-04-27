"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Gift } from "lucide-react";

export function RedeemButton({
  productId,
  productName,
  pointsCost,
  disabled = false,
  disabledReason,
}: {
  productId: string;
  productName: string;
  pointsCost: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function redeem() {
    if (
      !window.confirm(
        `Redeem "${productName}" for ${pointsCost} point${pointsCost === 1 ? "" : "s"}? This is one-shot — admin will fulfill manually.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/dashboard/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: productId }),
        });
        const raw = await res.text();
        let json: { ok?: true; order_id?: string; error?: string } = {};
        if (raw) {
          try {
            json = JSON.parse(raw);
          } catch {
            setError(`HTTP ${res.status}: ${raw.slice(0, 200)}`);
            return;
          }
        }
        if (!res.ok || json.error) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        // Land on the orders page so the new order is visible at the top
        // along with its pending fulfillment status.
        router.push("/dashboard/orders");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={redeem}
        title={disabled ? disabledReason : undefined}
        className="w-full inline-flex items-center justify-center gap-2 h-12 px-6 text-[14px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-500 transition-all"
      >
        <Gift size={16} />
        {pending
          ? "Redeeming…"
          : disabled
            ? disabledReason ?? "Unavailable"
            : `Redeem for ${pointsCost} pts`}
      </button>
      {error && (
        <div className="flex items-start gap-2 text-[13px] text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2 ring-1 ring-amber-500/30">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
