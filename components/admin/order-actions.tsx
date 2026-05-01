"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Ban, Save } from "lucide-react";

/**
 * Admin order actions for non-cancelled orders. The "Mark fulfilled" gate
 * was removed in Phase 3 — orders auto-fulfill on creation (or after
 * Razorpay payment confirms). Remaining actions:
 *
 *   - Save notes  → POST /api/admin/orders/[id]/notes
 *                   (used to record voucher codes, tracking numbers, etc.)
 *   - Cancel + refund → POST /api/admin/orders/[id]/cancel
 *                       (returns points to ambassador if pure-points;
 *                        money refunds for hybrid orders are handled
 *                        manually via Razorpay dashboard, then noted here)
 */
export function OrderActions({
  orderId,
  initialNotes,
}: {
  orderId: string;
  initialNotes: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<"save" | "cancel" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function call(action: "save" | "cancel") {
    if (action === "cancel") {
      if (
        !window.confirm(
          "Cancel this order? Points are refunded to the Yuvaah Club member if it was a pure-points order. Money refunds for hybrid orders must be issued manually via the Razorpay dashboard — record the refund ID in the notes.",
        )
      ) {
        return;
      }
    }

    setActiveAction(action);
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        const endpoint =
          action === "save"
            ? `/api/admin/orders/${orderId}/notes`
            : `/api/admin/orders/${orderId}/cancel`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_notes: notes }),
        });
        const raw = await res.text();
        let json: { ok?: true; error?: string } = {};
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
        if (action === "save") {
          setInfo("Notes saved.");
          router.refresh();
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
          Admin notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={2000}
          disabled={pending}
          placeholder="Voucher code, tracking number, internal note…"
          suppressHydrationWarning
          className="w-full mt-2 rounded-xl bg-paper ring-1 ring-line px-4 py-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 resize-y"
        />
        <span className="text-[12px] text-mute mt-1.5 block">
          Visible to the Yuvaah Club member on their order card after you save.
        </span>
      </label>

      {error && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {info && !error && (
        <div className="text-[13px] text-cyan-500 bg-cyan-50 rounded-xl px-4 py-3 ring-1 ring-cyan-300/60">
          {info}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => call("save")}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 text-[13.5px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft disabled:opacity-60"
        >
          <Save size={15} />
          {pending && activeAction === "save" ? "Saving…" : "Save notes"}
        </button>
        <button
          type="button"
          onClick={() => call("cancel")}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 text-[13.5px] font-semibold rounded-full bg-paper-2 text-amber-500 ring-1 ring-amber-500/40 hover:bg-amber-500/10 disabled:opacity-60"
        >
          <Ban size={15} />
          {pending && activeAction === "cancel" ? "Cancelling…" : "Cancel + refund"}
        </button>
      </div>
    </div>
  );
}
