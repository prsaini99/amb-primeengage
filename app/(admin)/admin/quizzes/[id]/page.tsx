import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, BarChart2 } from "lucide-react";

import { Badge, fmtDate } from "@/components/admin/table";
import { QuizForm } from "@/components/admin/quiz-form";
import {
  ActivateButton,
  DeactivateButton,
  DeleteRoundButton,
} from "@/components/admin/quiz-lifecycle-buttons";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  updateRound,
  activateRound,
  deactivateRound,
  deleteRound,
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

export default async function QuizDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: round, error } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .select(
      "id, title, description, status, time_limit_seconds, points_per_correct, questions_per_attempt, created_at, activated_at, closed_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
        {error.message}
      </div>
    );
  }
  if (!round) notFound();

  // Pool size
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: poolSize } = await (sb as any)
    .from("yuvaah_quiz_questions")
    .select("*", { head: true, count: "exact" })
    .eq("round_id", id);

  // Participant count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: participantCount } = await (sb as any)
    .from("yuvaah_quiz_attempts")
    .select("*", { head: true, count: "exact" })
    .eq("round_id", id);

  const pool = poolSize ?? 0;
  const participants = participantCount ?? 0;
  const badge = statusBadge(round.status as RoundStatus);
  const isDraft = round.status === "draft";
  const isActive = round.status === "active";
  const isClosed = round.status === "closed";

  // Bind id into server actions for useActionState / direct call.
  const editAction = updateRound.bind(null, round.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/quizzes"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to quiz rounds
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">
              {round.title}
            </h1>
            <p className="text-[13.5px] text-mute mt-1">
              Created {fmtDate(round.created_at)}
              {round.activated_at && ` · Activated ${fmtDate(round.activated_at)}`}
              {round.closed_at && ` · Closed ${fmtDate(round.closed_at)}`}
              {" "}· {pool} question{pool === 1 ? "" : "s"} in pool · {participants} participant{participants === 1 ? "" : "s"}
            </p>
          </div>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute mb-4">
              {isClosed ? "Round details (read-only)" : "Edit"}
            </h3>
            {isActive && (
              <div className="mb-4 flex items-start gap-2 text-[12.5px] text-amber-600 bg-amber-500/10 rounded-xl px-3 py-2.5 ring-1 ring-amber-500/30">
                <span>
                  This round is <strong>live</strong>. Edits apply immediately and
                  affect members currently playing — changing answers or points
                  won&apos;t rescore attempts already submitted.
                </span>
              </div>
            )}
            <QuizForm
              mode="edit"
              action={editAction}
              disabled={isClosed}
              initial={{
                title: round.title,
                description: round.description,
                time_limit_seconds: round.time_limit_seconds,
                points_per_correct: round.points_per_correct,
                questions_per_attempt: round.questions_per_attempt,
              }}
            />
          </div>
        </section>

        <aside className="space-y-6">
          {/* Lifecycle card */}
          <Card title="Lifecycle">
            {isDraft && (
              <>
                {pool < round.questions_per_attempt && (
                  <div className="mb-4 flex items-start gap-2 text-[12.5px] text-amber-500 bg-amber-500/10 rounded-xl px-3 py-2.5 ring-1 ring-amber-500/30">
                    <span>
                      Pool has {pool} question{pool === 1 ? "" : "s"} — need at least {round.questions_per_attempt} to activate.
                    </span>
                  </div>
                )}
                <ActivateButton id={round.id} onActivate={activateRound} />
                <p className="mt-3 text-[12.5px] text-mute leading-relaxed">
                  Activation locks the question pool and makes this round live for members. Only one round can be active at a time.
                </p>
              </>
            )}
            {isActive && (
              <>
                <DeactivateButton id={round.id} onDeactivate={deactivateRound} />
                <p className="mt-3 text-[12.5px] text-mute leading-relaxed">
                  Deactivating closes this round. Members who haven&apos;t submitted yet will no longer be able to. This cannot be undone.
                </p>
              </>
            )}
            {round.status === "closed" && (
              <p className="text-[13px] text-mute">
                This round is closed. Closed rounds cannot be re-activated.
              </p>
            )}
          </Card>

          {/* Questions card */}
          <Card title="Questions">
            <p className="text-[14px] text-navy-900">
              <span className="font-display text-3xl font-bold">{pool}</span>{" "}
              in pool
            </p>
            <Link
              href={`/admin/quizzes/${round.id}/questions`}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-navy-800 hover:text-amber-500"
            >
              <BookOpen size={14} />
              Manage questions →
            </Link>
          </Card>

          {/* Responses card */}
          <Card title="Responses">
            <p className="text-[14px] text-navy-900">
              <span className="font-display text-3xl font-bold">{participants}</span>{" "}
              participant{participants === 1 ? "" : "s"}
            </p>
            <Link
              href={`/admin/quizzes/${round.id}/responses`}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-navy-800 hover:text-amber-500"
            >
              <BarChart2 size={14} />
              View responses →
            </Link>
          </Card>

          {/* Danger zone — delete the whole round (cascades to questions +
              attempts; member ledger points are kept). */}
          <div className="rounded-2xl bg-red-50 ring-1 ring-red-200 p-6">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-red-600 mb-4">
              Danger zone
            </h3>
            <DeleteRoundButton
              id={round.id}
              participantCount={participants}
              onDelete={deleteRound}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6">
      <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}
