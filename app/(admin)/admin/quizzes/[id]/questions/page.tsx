import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, Lock } from "lucide-react";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PageHeading,
  TableShell,
  Th,
  Badge,
} from "@/components/admin/table";
import { QuestionForm } from "@/components/admin/question-form";
import { QuizCsvUpload } from "@/components/admin/quiz-csv-upload";
import { QuestionRow } from "@/components/admin/question-row";
import {
  addQuestion,
  updateQuestion,
  deleteQuestion,
  uploadQuestionsCsv,
} from "@/app/actions/quizzes";

export const dynamic = "force-dynamic";

type RoundStatus = "draft" | "active" | "closed";

function statusBadge(status: RoundStatus): {
  tone: "neutral" | "success" | "warn" | "danger" | "info";
  label: string;
} {
  if (status === "active") return { tone: "success", label: "active" };
  if (status === "closed") return { tone: "warn", label: "closed" };
  return { tone: "neutral", label: "draft" };
}

export default async function QuestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Auth gate.
  const gate = await requireAdmin();
  if (!gate.ok) {
    return (
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
        Not authorized.
      </div>
    );
  }

  const { id } = await params;
  const sb = createAdminClient();

  // Load round.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: round, error: roundErr } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .select("id, title, status, questions_per_attempt")
    .eq("id", id)
    .maybeSingle();

  if (roundErr) {
    return (
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
        {roundErr.message}
      </div>
    );
  }
  if (!round) notFound();

  // Load questions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: questions, error: qErr } = await (sb as any)
    .from("yuvaah_quiz_questions")
    .select(
      "id, question, option_a, option_b, option_c, option_d, correct_index, category, created_at",
    )
    .eq("round_id", id)
    .order("created_at", { ascending: true });

  if (qErr) {
    return (
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
        {qErr.message}
      </div>
    );
  }

  const poolSize = (questions ?? []).length;
  const isDraft = (round.status as RoundStatus) === "draft";
  const isActive = (round.status as RoundStatus) === "active";
  const isClosed = (round.status as RoundStatus) === "closed";
  // Draft + active pools are editable; closed pools are historical/read-only.
  const editable = !isClosed;
  const badge = statusBadge(round.status as RoundStatus);

  // Bind server actions to this round.
  const addAction = addQuestion.bind(null, round.id as string);
  const csvAction = uploadQuestionsCsv.bind(null, round.id as string);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href={`/admin/quizzes/${id}`}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to round
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <PageHeading
            title="Question pool"
            subtitle={`${round.title as string} · ${poolSize} question${poolSize === 1 ? "" : "s"}`}
          />
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
      </div>

      {/* Pool-too-small banner (draft only) */}
      {isDraft && poolSize < (round.questions_per_attempt as number) && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 px-4 py-3 ring-1 ring-amber-500/30 text-[13px] text-amber-600">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            This round requires at least{" "}
            <strong>{round.questions_per_attempt as number}</strong> questions to
            activate. Currently {poolSize} in pool — add{" "}
            {(round.questions_per_attempt as number) - poolSize} more.
          </span>
        </div>
      )}

      {/* Live-edit warning (active rounds are editable but live) */}
      {isActive && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 px-4 py-3 ring-1 ring-amber-500/30 text-[13px] text-amber-600">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            This round is <strong>live</strong>. Pool edits apply immediately to
            members still playing. The pool can&apos;t drop below{" "}
            <strong>{round.questions_per_attempt as number}</strong> question
            {(round.questions_per_attempt as number) === 1 ? "" : "s"} while active.
          </span>
        </div>
      )}

      {/* Locked notice (closed rounds only) */}
      {isClosed && (
        <div className="flex items-start gap-3 rounded-xl bg-navy-800/5 px-4 py-3 ring-1 ring-navy-800/20 text-[13px] text-navy-800">
          <Lock size={15} className="mt-0.5 shrink-0" />
          <span>
            This question pool is <strong>locked</strong> — the round is{" "}
            <strong>closed</strong>. Closed rounds are read-only.
          </span>
        </div>
      )}

      {/* Question table */}
      <TableShell>
        <thead>
          <tr>
            <Th className="w-8">#</Th>
            <Th>Question</Th>
            <Th>Category</Th>
            <Th>A</Th>
            <Th>B</Th>
            <Th>C</Th>
            <Th>D</Th>
            <Th>Correct</Th>
            {editable && <Th>{""}</Th>}
          </tr>
        </thead>
        <tbody>
          {(!questions || questions.length === 0) && (
            <tr>
              <td
                colSpan={editable ? 9 : 8}
                className="px-4 py-10 text-center text-mute border-b border-line"
              >
                No questions yet.{" "}
                {editable && "Add questions below or upload a CSV."}
              </td>
            </tr>
          )}

          {editable
            ? (questions ?? []).map(
                (
                  q: {
                    id: string;
                    question: string;
                    option_a: string;
                    option_b: string;
                    option_c: string;
                    option_d: string;
                    correct_index: number;
                    category: string | null;
                  },
                  i: number,
                ) => (
                  <QuestionRow
                    key={q.id}
                    question={q}
                    index={i}
                    updateAction={updateQuestion}
                    deleteAction={deleteQuestion}
                  />
                ),
              )
            : (questions ?? []).map(
                (
                  q: {
                    id: string;
                    question: string;
                    option_a: string;
                    option_b: string;
                    option_c: string;
                    option_d: string;
                    correct_index: number;
                    category: string | null;
                  },
                  i: number,
                ) => (
                  <ReadOnlyRow key={q.id} question={q} index={i} />
                ),
              )}
        </tbody>
      </TableShell>

      {/* Add question form — editable (draft + active) */}
      {editable && (
        <section className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8 space-y-4">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute">
            Add a question manually
          </h3>
          <QuestionForm mode="add" action={addAction} />
        </section>
      )}

      {/* CSV upload — editable (draft + active) */}
      {editable && (
        <section className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8 space-y-4">
          <div>
            <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute">
              Bulk upload via CSV
            </h3>
            <p className="text-[13px] text-mute mt-1">
              All rows must be valid — any error aborts the upload (nothing is
              inserted).
            </p>
          </div>
          <QuizCsvUpload action={csvAction} />
        </section>
      )}
    </div>
  );
}

// ---------- read-only row (non-draft rounds) ----------------------------------

const CORRECT_LABEL = ["A", "B", "C", "D"] as const;

function ReadOnlyRow({
  question,
  index,
}: {
  question: {
    id: string;
    question: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_index: number;
    category: string | null;
  };
  index: number;
}) {
  return (
    <tr className="hover:bg-paper/60">
      <td className="px-4 py-3 border-b border-line text-mute font-mono text-[12px] align-top">
        {index + 1}
      </td>
      <td className="px-4 py-3 border-b border-line text-navy-900 align-top max-w-xs">
        <span className="line-clamp-2 text-[13.5px]">{question.question}</span>
      </td>
      <td className="px-4 py-3 border-b border-line text-navy-900 align-top">
        {question.category ? (
          <span className="text-[12.5px] text-mute">{question.category}</span>
        ) : (
          <span className="text-[12px] text-mute/40">—</span>
        )}
      </td>
      <td className="px-4 py-3 border-b border-line text-[12.5px] align-top max-w-[120px]">
        <span className="line-clamp-2">{question.option_a}</span>
      </td>
      <td className="px-4 py-3 border-b border-line text-[12.5px] align-top max-w-[120px]">
        <span className="line-clamp-2">{question.option_b}</span>
      </td>
      <td className="px-4 py-3 border-b border-line text-[12.5px] align-top max-w-[120px]">
        <span className="line-clamp-2">{question.option_c}</span>
      </td>
      <td className="px-4 py-3 border-b border-line text-[12.5px] align-top max-w-[120px]">
        <span className="line-clamp-2">{question.option_d}</span>
      </td>
      <td className="px-4 py-3 border-b border-line align-top">
        <Badge tone="success">
          {CORRECT_LABEL[question.correct_index as 0 | 1 | 2 | 3]}
        </Badge>
      </td>
    </tr>
  );
}
