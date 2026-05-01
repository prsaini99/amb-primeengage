"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Gift } from "lucide-react";

const RZP_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string };
  notes?: Record<string, string>;
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
  theme?: { color?: string };
};

type RazorpayInstance = { open: () => void };

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

/**
 * Interactive split selector for store redemption. The ambassador picks
 * how many of their points to use; the rest auto-fills as INR via Razorpay.
 *
 *   pointsToUse range: [0, min(balance, pointsCost)]
 *   shortfallPts     = pointsCost - pointsToUse
 *   shortfallInr     = ceil(shortfallPts × rate × 100) / 100   (display)
 *
 * Routing on submit:
 *   shortfallPts === 0  →  POST /api/dashboard/orders   (pure-points, no Razorpay)
 *   shortfallPts > 0    →  POST /api/dashboard/orders/payment-init
 *                          → load checkout.js → open modal → on success
 *                          POST /api/dashboard/orders/payment-verify →
 *                          redirect to /dashboard/orders.
 *
 * Server re-derives the INR amount from points_to_use + the live rate with
 * a 1-paise tolerance, so the client cannot under-pay.
 */
export function RedemptionPanel({
  productId,
  productName,
  pointsCost,
  balance,
  rate,
  disabled = false,
  disabledReason,
}: {
  productId: string;
  productName: string;
  pointsCost: number;
  balance: number;
  rate: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const maxPointsToUse = Math.min(balance, pointsCost);
  // Default to the most-points / least-money split (everyone's instinct
  // is "use my points first"). They can drag down if they want to save points.
  const [pointsToUse, setPointsToUse] = useState<number>(maxPointsToUse);

  const { shortfallPts, shortfallInr, isHybrid } = useMemo(() => {
    const sPts = pointsCost - pointsToUse;
    const sInrPaise = Math.ceil(sPts * rate * 100);
    return {
      shortfallPts: sPts,
      shortfallInr: sInrPaise / 100,
      isHybrid: sPts > 0,
    };
  }, [pointsCost, pointsToUse, rate]);

  function loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("Window unavailable"));
        return;
      }
      if (window.Razorpay) {
        resolve();
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${RZP_SCRIPT_SRC}"]`,
      );
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error("Failed to load Razorpay checkout.js")),
        );
        return;
      }
      const script = document.createElement("script");
      script.src = RZP_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load Razorpay checkout.js"));
      document.body.appendChild(script);
    });
  }

  async function purePoints() {
    if (
      !window.confirm(
        `Redeem "${productName}" for ${pointsToUse} point${pointsToUse === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/dashboard/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      const raw = await res.text();
      const json = parseMaybeJson(raw);
      if (!res.ok || json.error) {
        setError(json.error ?? `HTTP ${res.status}: ${raw.slice(0, 200)}`);
        return;
      }
      router.push("/dashboard/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function hybrid() {
    setError(null);
    setInfo(null);

    let initJson: {
      order_id: string;
      razorpay_order_id: string;
      amount_paise: number;
      key_id: string;
      product_name: string;
      points_to_use: number;
      shortfall_points: number;
      prefill: { name: string; email: string };
    };
    try {
      const initRes = await fetch("/api/dashboard/orders/payment-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          points_to_use: pointsToUse,
        }),
      });
      const raw = await initRes.text();
      const json = parseMaybeJson(raw);
      if (!initRes.ok || json.error) {
        setError(json.error ?? `HTTP ${initRes.status}: ${raw.slice(0, 200)}`);
        return;
      }
      initJson = json as typeof initJson;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    const inrDisplay = (initJson.amount_paise / 100).toFixed(2);
    if (
      !window.confirm(
        `Open Razorpay to pay ₹${inrDisplay}? You'll use ${initJson.points_to_use} of your points and pay the rest in INR.`,
      )
    ) {
      setInfo(
        "Order parked as 'awaiting payment'. Retry from the store any time.",
      );
      return;
    }

    try {
      await loadRazorpayScript();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (!window.Razorpay) {
      setError("Razorpay checkout failed to load. Please retry.");
      return;
    }

    const rzp = new window.Razorpay({
      key: initJson.key_id,
      amount: initJson.amount_paise,
      currency: "INR",
      order_id: initJson.razorpay_order_id,
      name: "Prime Engage",
      description: `Hybrid redemption · ${initJson.product_name}`,
      prefill: initJson.prefill,
      notes: { our_order_id: initJson.order_id },
      theme: { color: "#F59242" },
      handler(response) {
        startTransition(async () => {
          try {
            const verifyRes = await fetch(
              "/api/dashboard/orders/payment-verify",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  order_id: initJson.order_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              },
            );
            const raw = await verifyRes.text();
            const json = parseMaybeJson(raw);
            if (!verifyRes.ok || json.error) {
              setError(
                json.error ?? `HTTP ${verifyRes.status}: ${raw.slice(0, 200)}`,
              );
              return;
            }
            router.push("/dashboard/orders");
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        });
      },
      modal: {
        ondismiss() {
          setInfo(
            "Payment cancelled. The order is parked as 'awaiting payment' — retry any time.",
          );
        },
      },
    });
    rzp.open();
  }

  function onClick() {
    if (disabled) return;
    if (isHybrid) {
      void hybrid();
    } else {
      void purePoints();
    }
  }

  // Slider only matters when there's actually a choice to make. If
  // maxPointsToUse is 0 (no points at all), hide the slider; the only path
  // is full money.
  const showSlider = maxPointsToUse > 0;

  const buttonLabel = disabled
    ? disabledReason ?? "Unavailable"
    : isHybrid
      ? `Pay ₹${shortfallInr.toFixed(2)} + redeem`
      : `Redeem for ${pointsToUse} pts`;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-5">
        <div className="flex items-end justify-between gap-3 mb-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute">
            Choose your split
          </p>
          <p className="text-[12px] text-mute">
            Your balance: <span className="font-semibold text-navy-900">{balance}</span> pts
          </p>
        </div>

        {showSlider ? (
          <>
            <input
              type="range"
              min={0}
              max={maxPointsToUse}
              step={1}
              value={pointsToUse}
              onChange={(e) => setPointsToUse(Number(e.target.value))}
              disabled={disabled || pending}
              suppressHydrationWarning
              className="w-full accent-amber-500 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="mt-1 flex justify-between text-[11px] text-mute font-mono">
              <span>0</span>
              <span>{maxPointsToUse}</span>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-mute">
            You have no points yet — pay the full price in INR to redeem.
          </p>
        )}

        <dl className="mt-4 grid grid-cols-3 gap-3 text-[12.5px]">
          <div className="rounded-lg bg-paper ring-1 ring-line px-3 py-2">
            <dt className="text-mute uppercase tracking-wider text-[10.5px] font-semibold">
              Points used
            </dt>
            <dd className="font-display text-[18px] font-bold text-navy-900 mt-0.5">
              {pointsToUse}
            </dd>
          </div>
          <div className="rounded-lg bg-paper ring-1 ring-line px-3 py-2">
            <dt className="text-mute uppercase tracking-wider text-[10.5px] font-semibold">
              Pay in INR
            </dt>
            <dd className="font-display text-[18px] font-bold text-navy-900 mt-0.5">
              ₹{shortfallInr.toFixed(2)}
            </dd>
          </div>
          <div className="rounded-lg bg-paper ring-1 ring-line px-3 py-2">
            <dt className="text-mute uppercase tracking-wider text-[10.5px] font-semibold">
              Total value
            </dt>
            <dd className="font-display text-[18px] font-bold text-navy-900 mt-0.5">
              {pointsCost} pts
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-[11.5px] text-mute">
          Rate: 1 point ≈ ₹{rate.toFixed(2)}. Final amount is computed
          server-side at checkout.
        </p>
      </div>

      <button
        type="button"
        disabled={disabled || pending}
        onClick={onClick}
        title={disabled ? disabledReason : undefined}
        className="w-full inline-flex items-center justify-center gap-2 h-12 px-6 text-[14px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-500 transition-all"
      >
        <Gift size={16} />
        {pending ? "Processing…" : buttonLabel}
      </button>

      {error && (
        <div className="flex items-start gap-2 text-[13px] text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2 ring-1 ring-amber-500/30">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {info && !error && (
        <div className="text-[13px] text-cyan-500 bg-cyan-50 rounded-lg px-3 py-2 ring-1 ring-cyan-300/60">
          {info}
        </div>
      )}
    </div>
  );
}

function parseMaybeJson(raw: string): { ok?: true; error?: string } & Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { error: undefined };
  }
}
