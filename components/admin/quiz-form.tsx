"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Save } from "lucide-react";

import type { RoundFormResult } from "@/app/actions/quizzes";

type Mode =
  | {
      mode: "create";
      action: (prev: RoundFormResult | null, fd: FormData) => Promise<RoundFormResult | null>;
    }
  | {
      mode: "edit";
      action: (prev: RoundFormResult | null, fd: FormData) => Promise<RoundFormResult | null>;
      disabled?: boolean;
      initial: {
        title: string;
        description: string | null;
        time_limit_seconds: number | null;
        points_per_correct: number;
        questions_per_attempt: number;
      };
    };

export function QuizForm(props: Mode) {
  const router = useRouter();
  const [state, action, pending] = useActionState<RoundFormResult | null, FormData>(
    props.action,
    null,
  );

  const initial = props.mode === "edit" ? props.initial : null;
  const disabled = props.mode === "edit" ? (props.disabled ?? false) : false;

  useEffect(() => {
    if (state && state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-5">
      <Field label="Title">
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={initial?.title ?? ""}
          disabled={pending || disabled}
          suppressHydrationWarning
          className={inputCls(disabled)}
        />
      </Field>

      <Field label="Description" hint="Optional — admin context only, not shown to members yet.">
        <textarea
          name="description"
          rows={4}
          defaultValue={initial?.description ?? ""}
          disabled={pending || disabled}
          suppressHydrationWarning
          className={inputCls(disabled) + " resize-y min-h-[100px] font-mono text-[13px] leading-relaxed"}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Field label="Time limit (seconds)" hint="Leave blank for no limit.">
          <input
            name="time_limit_seconds"
            type="number"
            min={0}
            step={1}
            defaultValue={initial?.time_limit_seconds ?? ""}
            disabled={pending || disabled}
            suppressHydrationWarning
            className={inputCls(disabled)}
          />
        </Field>

        <Field label="Points per correct" hint="Default: 10.">
          <input
            name="points_per_correct"
            type="number"
            min={0}
            step={1}
            defaultValue={initial?.points_per_correct ?? 10}
            disabled={pending || disabled}
            suppressHydrationWarning
            className={inputCls(disabled)}
          />
        </Field>

        <Field label="Questions per attempt" hint="How many from the pool. Default: 10.">
          <input
            name="questions_per_attempt"
            type="number"
            min={1}
            step={1}
            defaultValue={initial?.questions_per_attempt ?? 10}
            disabled={pending || disabled}
            suppressHydrationWarning
            className={inputCls(disabled)}
          />
        </Field>
      </div>

      {disabled && (
        <div className="flex items-start gap-2.5 text-[13px] text-navy-800 bg-navy-800/5 rounded-xl px-4 py-3 ring-1 ring-navy-800/20">
          <span>This round is closed and is read-only. Closed rounds cannot be edited.</span>
        </div>
      )}

      {state && !state.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
      {state && state.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-cyan-500 bg-cyan-50 rounded-xl px-4 py-3 ring-1 ring-cyan-300/60">
          <Check size={16} className="mt-0.5 shrink-0" />
          <span>Saved.</span>
        </div>
      )}

      {!disabled && (
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 text-[13.5px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft disabled:opacity-60"
          >
            <Save size={15} />
            {pending
              ? props.mode === "create" ? "Creating…" : "Saving…"
              : props.mode === "create" ? "Create round" : "Save changes"}
          </button>
          <Link
            href="/admin/quizzes"
            className="text-[13px] text-mute hover:text-navy-900"
          >
            Cancel
          </Link>
        </div>
      )}
    </form>
  );
}

function inputCls(disabled: boolean) {
  return (
    "w-full mt-2 rounded-xl bg-paper-2 ring-1 ring-line px-4 py-3 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50" +
    (disabled ? " cursor-not-allowed" : "")
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
        {label}
      </span>
      {children}
      {hint && <span className="text-[12px] text-mute mt-1.5 block">{hint}</span>}
    </label>
  );
}
