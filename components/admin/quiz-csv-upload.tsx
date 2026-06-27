"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, Check, Upload, Download } from "lucide-react";

import type { CsvUploadResult } from "@/app/actions/quizzes";

// CSV template: header row + one sample line.
const CSV_TEMPLATE = `question,option_a,option_b,option_c,option_d,correct,category
What is the capital of France?,Paris,London,Rome,Berlin,A,Geography`;

const TEMPLATE_DATA_URL = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;

type Props = {
  /** Server action bound to the round id: `uploadQuestionsCsv.bind(null, roundId)` */
  action: (formData: FormData) => Promise<CsvUploadResult>;
};

export function QuizCsvUpload({ action }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<CsvUploadResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await action(fd);
      setResult(res);
      if (res.ok) {
        // Clear file input on success.
        if (fileRef.current) fileRef.current.value = "";
        setFileName(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Template download */}
      <div className="flex items-center gap-3">
        <a
          href={TEMPLATE_DATA_URL}
          download="quiz_questions_template.csv"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-navy-800 hover:text-amber-500"
        >
          <Download size={13} />
          Download CSV template
        </a>
        <span className="text-[12px] text-mute">
          — columns:{" "}
          <code className="font-mono bg-paper px-1 py-0.5 rounded text-[11px]">
            question, option_a, option_b, option_c, option_d, correct, category
          </code>
        </span>
      </div>

      {/* Upload form */}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="block flex-1 min-w-[220px]">
          <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
            CSV file
          </span>
          <input
            ref={fileRef}
            name="csv_file"
            type="file"
            accept=".csv,text/csv"
            required
            disabled={isPending}
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            suppressHydrationWarning
            className="mt-2 block w-full text-[13px] text-mute file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-navy-900 file:text-white file:text-[12.5px] file:font-semibold hover:file:bg-navy-800 disabled:opacity-50"
          />
          {fileName && (
            <span className="text-[12px] text-mute mt-1 block truncate">
              {fileName}
            </span>
          )}
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 h-10 px-5 text-[13px] font-semibold rounded-full bg-navy-900 hover:bg-navy-800 text-white disabled:opacity-60 shrink-0"
        >
          <Upload size={14} />
          {isPending ? "Uploading…" : "Upload questions"}
        </button>
      </form>

      {/* Success */}
      {result && result.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-cyan-600 bg-cyan-50 rounded-xl px-4 py-3 ring-1 ring-cyan-300/60">
          <Check size={16} className="mt-0.5 shrink-0" />
          <span>
            {result.inserted} question{result.inserted === 1 ? "" : "s"}{" "}
            inserted successfully.
          </span>
        </div>
      )}

      {/* Top-level error (auth / round-not-draft / file missing) */}
      {result && !result.ok && !result.errors && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{result.error}</span>
        </div>
      )}

      {/* Per-line CSV errors — nothing was inserted */}
      {result && !result.ok && result.errors && result.errors.length > 0 && (
        <div className="rounded-xl ring-1 ring-amber-500/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border-b border-amber-500/20">
            <AlertCircle size={14} className="text-amber-500 shrink-0" />
            <span className="text-[12.5px] font-semibold text-amber-600">
              {result.error} Fix the following errors and re-upload:
            </span>
          </div>
          <ul className="divide-y divide-amber-500/10 max-h-64 overflow-y-auto">
            {result.errors.map((err, i) => (
              <li
                key={i}
                className="flex items-start gap-3 px-4 py-2.5 text-[12.5px]"
              >
                <span className="shrink-0 font-mono font-semibold text-mute w-16">
                  line {err.line}
                </span>
                <span className="text-amber-700">{err.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
