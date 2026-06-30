"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Save, X } from "lucide-react";

import type { QuestionFormResult } from "@/app/actions/quizzes";

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

type QuestionInitial = {
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_index: number;
  category: string | null;
};

type Props =
  | {
      mode: "add";
      action: (
        prev: QuestionFormResult | null,
        fd: FormData,
      ) => Promise<QuestionFormResult>;
    }
  | {
      mode: "edit";
      action: (
        prev: QuestionFormResult | null,
        fd: FormData,
      ) => Promise<QuestionFormResult>;
      initial: QuestionInitial;
      onCancel?: () => void;
    };

export function QuestionForm(props: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    QuestionFormResult | null,
    FormData
  >(props.action, null);

  const initial = props.mode === "edit" ? props.initial : null;

  useEffect(() => {
    if (state && state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      {/* Question */}
      <Field label="Question">
        <textarea
          name="question"
          required
          rows={3}
          defaultValue={initial?.question ?? ""}
          disabled={pending}
          suppressHydrationWarning
          className={`${inputCls} resize-y min-h-[80px] font-mono text-[13px] leading-relaxed`}
          placeholder="Enter the question text…"
        />
      </Field>

      {/* Options A–D */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(["option_a", "option_b", "option_c", "option_d"] as const).map(
          (name, i) => (
            <Field key={name} label={`Option ${OPTION_LABELS[i]}`}>
              <input
                name={name}
                required
                defaultValue={
                  initial
                    ? ([
                        initial.option_a,
                        initial.option_b,
                        initial.option_c,
                        initial.option_d,
                      ][i] ?? "")
                    : ""
                }
                disabled={pending}
                suppressHydrationWarning
                className={inputCls}
                placeholder={`Option ${OPTION_LABELS[i]}…`}
              />
            </Field>
          ),
        )}
      </div>

      {/* Correct answer + category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Correct answer" hint="Which option is correct?">
          <select
            name="correct_index"
            required
            defaultValue={String(initial?.correct_index ?? "0")}
            disabled={pending}
            suppressHydrationWarning
            className={inputCls}
          >
            {OPTION_LABELS.map((label, i) => (
              <option key={i} value={String(i)}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Category" hint="Optional (e.g. Science, History).">
          <input
            name="category"
            defaultValue={initial?.category ?? ""}
            disabled={pending}
            suppressHydrationWarning
            className={inputCls}
            placeholder="Optional category…"
          />
        </Field>
      </div>

      {/* Feedback */}
      {state && !state.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
      {state && state.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-cyan-500 bg-cyan-50 rounded-xl px-4 py-3 ring-1 ring-cyan-300/60">
          <Check size={16} className="mt-0.5 shrink-0" />
          <span>
            {props.mode === "add" ? "Question added." : "Question saved."}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 h-10 px-5 text-[13px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft disabled:opacity-60"
        >
          <Save size={14} />
          {pending
            ? props.mode === "add"
              ? "Adding…"
              : "Saving…"
            : props.mode === "add"
              ? "Add question"
              : "Save changes"}
        </button>
        {props.mode === "edit" && props.onCancel && (
          <button
            type="button"
            onClick={props.onCancel}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-[13px] text-mute hover:text-navy-900"
          >
            <X size={14} /> Cancel
          </button>
        )}
      </div>
    </form>
  );
}

const inputCls =
  "w-full mt-2 rounded-xl bg-paper-2 ring-1 ring-line px-4 py-3 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50";

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
      {hint && (
        <span className="text-[12px] text-mute mt-1.5 block">{hint}</span>
      )}
    </label>
  );
}
