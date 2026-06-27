import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Th, Td, Badge, fmtDate } from "@/components/admin/table";

export const dynamic = "force-dynamic";

const OPTIONS = ["A", "B", "C", "D"] as const;

type QuestionDetail = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_index: number;
};

function opt(q: QuestionDetail, idx: number): string {
  return [q.option_a, q.option_b, q.option_c, q.option_d][idx] ?? "—";
}

export default async function AttemptDetailPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return (
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
        Not authorized.
      </div>
    );
  }

  const { id, attemptId } = await params;
  const sb = createAdminClient();

  // Attempt (scoped to this round).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: attempt } = await (sb as any)
    .from("yuvaah_quiz_attempts")
    .select(
      "id, round_id, profile_id, status, score, correct_count, wrong_count, unanswered_count, started_at, completed_at, assigned_question_ids, answers, points_ledger_id",
    )
    .eq("id", attemptId)
    .eq("round_id", id)
    .maybeSingle();

  if (!attempt) notFound();

  // Round (for max score) + candidate profile + assigned questions, in parallel.
  const [roundRes, profileRes, questionsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb as any)
      .from("yuvaah_quiz_rounds")
      .select("title, points_per_correct, questions_per_attempt")
      .eq("id", id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb as any)
      .from("amb_profiles")
      .select("first_name, last_name, email, phone, college, city, created_at")
      .eq("id", attempt.profile_id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb as any)
      .from("yuvaah_quiz_questions")
      .select("id, question, option_a, option_b, option_c, option_d, correct_index")
      .in("id", (attempt.assigned_question_ids as string[]) ?? []),
  ]);

  const round = roundRes.data;
  const profile = profileRes.data;
  const questionById: Record<string, QuestionDetail> = {};
  for (const q of questionsRes.data ?? []) {
    questionById[q.id as string] = q as QuestionDetail;
  }

  const name = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Unknown member"
    : "Unknown member";
  const assignedIds = (attempt.assigned_question_ids as string[]) ?? [];
  const answers = (attempt.answers as Record<string, number | null>) ?? {};
  const maxScore = round
    ? (round.questions_per_attempt as number) * (round.points_per_correct as number)
    : null;
  const pointsCredited = attempt.points_ledger_id !== null ? attempt.score ?? 0 : 0;

  return (
    <div className="space-y-8">
      {/* Back */}
      <Link
        href={`/admin/quizzes/${id}/responses`}
        className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
      >
        <ArrowLeft size={14} /> Back to responses
      </Link>

      {/* Candidate card */}
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-semibold text-navy-900">
                {name}
              </h1>
              <Badge tone={attempt.status === "completed" ? "success" : "info"}>
                {attempt.status === "completed" ? "completed" : "in progress"}
              </Badge>
            </div>
            {round && (
              <p className="text-[13px] text-mute mt-1">{round.title as string}</p>
            )}
          </div>
          <div className="text-right">
            <div className="font-display text-3xl font-bold text-navy-900">
              {attempt.score ?? "—"}
              {maxScore !== null && (
                <span className="text-mute font-normal text-[15px]"> / {maxScore}</span>
              )}
            </div>
            <div className="text-[12px] text-mute mt-1">
              {pointsCredited} pts credited
            </div>
          </div>
        </div>

        {/* Profile facts */}
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-[13px]">
          <Fact label="Email" value={profile?.email as string | undefined} />
          <Fact label="Phone" value={profile?.phone as string | undefined} />
          <Fact label="College" value={profile?.college as string | undefined} />
          <Fact label="City" value={profile?.city as string | undefined} />
          <Fact
            label="Started"
            value={attempt.started_at ? fmtDate(attempt.started_at) : undefined}
          />
          <Fact
            label="Submitted"
            value={attempt.completed_at ? fmtDate(attempt.completed_at) : "—"}
          />
        </dl>

        {/* Score breakdown chips */}
        <div className="mt-5 flex flex-wrap gap-2 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 ring-1 ring-cyan-300/60 px-3 py-1 text-navy-800">
            <CheckCircle2 size={13} className="text-cyan-500" />
            {attempt.correct_count ?? 0} correct
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 ring-1 ring-red-200 px-3 py-1 text-red-600">
            <XCircle size={13} /> {attempt.wrong_count ?? 0} wrong
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-paper ring-1 ring-line px-3 py-1 text-mute">
            <MinusCircle size={13} /> {attempt.unanswered_count ?? 0} skipped
          </span>
        </div>
      </div>

      {/* Per-question detail */}
      {attempt.status === "completed" ? (
        <section>
          <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute mb-4">
            Answer detail
          </h2>
          <div className="rounded-2xl bg-paper-2 ring-1 ring-line overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <Th className="w-8">#</Th>
                    <Th>Question</Th>
                    <Th>Member answered</Th>
                    <Th>Correct answer</Th>
                    <Th className="w-10">{""}</Th>
                  </tr>
                </thead>
                <tbody>
                  {assignedIds.map((qid, idx) => {
                    const q = questionById[qid];
                    if (!q) return null;
                    const memberIdx = answers[qid];
                    const isUnanswered = memberIdx === null || memberIdx === undefined;
                    const isCorrect = !isUnanswered && memberIdx === q.correct_index;
                    const isWrong = !isUnanswered && !isCorrect;
                    return (
                      <tr
                        key={qid}
                        className={
                          isCorrect
                            ? "bg-cyan-50/30"
                            : isWrong
                              ? "bg-red-50/30"
                              : ""
                        }
                      >
                        <Td className="text-mute font-mono text-[12px]">{idx + 1}</Td>
                        <Td className="max-w-md">{q.question}</Td>
                        <Td>
                          {isUnanswered ? (
                            <span className="text-mute italic text-[12.5px]">skipped</span>
                          ) : (
                            <span className={isCorrect ? "text-cyan-700 font-medium" : "text-red-600"}>
                              <span className="font-semibold">
                                {OPTIONS[memberIdx as 0 | 1 | 2 | 3]}.
                              </span>{" "}
                              {opt(q, memberIdx as number)}
                            </span>
                          )}
                        </Td>
                        <Td>
                          <span className="text-navy-800 font-medium">
                            <span className="font-semibold">
                              {OPTIONS[q.correct_index as 0 | 1 | 2 | 3]}.
                            </span>{" "}
                            {opt(q, q.correct_index)}
                          </span>
                        </Td>
                        <Td>
                          {isCorrect && <CheckCircle2 size={15} className="text-cyan-500" />}
                          {isWrong && <XCircle size={15} className="text-red-500" />}
                          {isUnanswered && <MinusCircle size={15} className="text-mute" />}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <p className="text-[13.5px] text-mute">
          This attempt is still in progress — answer detail will appear once the
          member submits.
        </p>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.16em] text-mute font-semibold">
        {label}
      </dt>
      <dd className="text-navy-900 mt-0.5 break-words">{value || "—"}</dd>
    </div>
  );
}
