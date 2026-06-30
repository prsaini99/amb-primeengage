/**
 * /quiz — Member quiz landing / gate page.
 *
 * Server component. Reads the active round + this member's attempt via the
 * admin client (RLS disabled on quiz tables; service-role bypasses it). Branches:
 *
 *   1. No active round           → dormant card
 *   2. Completed attempt         → ResultCard with stored score + "already attempted" notice
 *   3. In-progress attempt       → "Resume quiz" CTA → /quiz/play
 *   4. No attempt yet            → "Start quiz" CTA → /quiz/play
 */

import Link from "next/link";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";
import { ResultCard } from "@/components/quiz/result-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yuvaah Club Quiz · Yuvaah" };

export default async function QuizLandingPage() {
  const { profileId } = await requireAmbassador();
  const sb = createAdminClient();

  // 1. Load the one active round (at most one at a time by DB constraint).
  const { data: round } = await sb
    .from("yuvaah_quiz_rounds")
    .select("id, title, description, points_per_correct, questions_per_attempt, time_limit_seconds")
    .eq("status", "active")
    .maybeSingle();

  // --- State 1: No active round → dormant ---
  if (!round) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="h-16 w-16 rounded-2xl bg-paper-2 ring-1 ring-line grid place-items-center text-3xl mb-6">
          📋
        </div>
        <h1 className="font-display text-2xl font-semibold text-navy-900 mb-2">
          No active quiz right now
        </h1>
        <p className="text-[14px] text-mute max-w-sm">
          Check back soon — the next Yuvaah Club Quiz will appear here when it&apos;s
          live.
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-mute hover:text-navy-900">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  // 2. Load this member's attempt for the active round.
  const { data: attempt } = await sb
    .from("yuvaah_quiz_attempts")
    .select(
      "id, status, score, correct_count, wrong_count, unanswered_count, points_ledger_id",
    )
    .eq("round_id", round.id)
    .eq("profile_id", profileId)
    .maybeSingle();

  // --- State 2: Completed attempt → show result ---
  if (attempt?.status === "completed") {
    const total = round.questions_per_attempt;
    const score = attempt.score ?? 0;
    const correctCount = attempt.correct_count ?? 0;
    const wrongCount = attempt.wrong_count ?? 0;
    const unansweredCount = attempt.unanswered_count ?? 0;
    const pointsCredited = attempt.points_ledger_id !== null ? score : 0;
    // maxScore = total questions × points per question
    const maxScore = total * round.points_per_correct;

    return (
      <div className="min-h-screen bg-paper px-4 py-10">
        <div className="max-w-lg mx-auto space-y-6">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[13px] text-mute hover:text-navy-900">
            ← Back to dashboard
          </Link>
          <div className="text-center">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-mute mb-1">
              Yuvaah Club Quiz
            </p>
            <h1 className="font-display text-2xl font-semibold text-navy-900">
              {round.title}
            </h1>
          </div>

          <div className="bg-cyan-50 ring-1 ring-cyan-300/60 rounded-xl px-5 py-3 text-center">
            <p className="text-[13.5px] text-navy-800 font-medium">
              You&apos;ve already completed this round. Here&apos;s how you did:
            </p>
          </div>

          <ResultCard
            score={score}
            correctCount={correctCount}
            wrongCount={wrongCount}
            unansweredCount={unansweredCount}
            pointsCredited={pointsCredited}
            maxScore={maxScore}
            theme="clean"
          />
        </div>
      </div>
    );
  }

  // --- State 3: In-progress → Resume CTA  |  State 4: No attempt → Start CTA ---
  const hasInProgress = attempt?.status === "in_progress";
  const ctaLabel = hasInProgress ? "Resume quiz" : "Start quiz";
  const ctaHint = hasInProgress
    ? "You have an in-progress attempt — your question set is already locked and waiting."
    : "You'll get a random set of questions. Once started, your question set is locked until you submit.";

  const totalQuestions = round.questions_per_attempt;
  const maxPoints = totalQuestions * round.points_per_correct;
  const hasTimer = round.time_limit_seconds !== null && round.time_limit_seconds > 0;
  const timeLimitMins = hasTimer
    ? Math.round((round.time_limit_seconds ?? 0) / 60)
    : null;

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="max-w-lg mx-auto space-y-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[13px] text-mute hover:text-navy-900">
          ← Back to dashboard
        </Link>
        {/* Header */}
        <div className="text-center">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-mute mb-1">
            Yuvaah Club Quiz
          </p>
          <h1 className="font-display text-2xl font-semibold text-navy-900 mb-1">
            {round.title}
          </h1>
          {round.description && (
            <p className="text-[14px] text-mute">{round.description}</p>
          )}
        </div>

        {/* Quiz info card */}
        <div className="bg-paper-2 ring-1 ring-line rounded-2xl p-6 space-y-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-mute">
            Quiz details
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-paper rounded-xl p-4 ring-1 ring-line">
              <div className="font-display text-2xl font-bold text-navy-900">
                {totalQuestions}
              </div>
              <div className="text-[11.5px] text-mute font-medium uppercase tracking-wider mt-1">
                Questions
              </div>
            </div>
            <div className="bg-paper rounded-xl p-4 ring-1 ring-line">
              <div className="font-display text-2xl font-bold text-cyan-500">
                {maxPoints}
              </div>
              <div className="text-[11.5px] text-mute font-medium uppercase tracking-wider mt-1">
                Max points
              </div>
            </div>
          </div>

          {hasTimer && timeLimitMins !== null && (
            <div className="flex items-center gap-2.5 text-[13.5px] text-navy-800">
              <span className="text-base">⏱</span>
              <span>
                Time limit:{" "}
                <span className="font-semibold">{timeLimitMins} minutes</span>
              </span>
            </div>
          )}

          <div className="flex items-start gap-2.5 text-[13.5px] text-navy-800">
            <span className="text-base mt-px">ℹ️</span>
            <span>{ctaHint}</span>
          </div>

          <div className="flex items-center gap-2.5 text-[13.5px] text-mute">
            <span className="text-base">🔒</span>
            <span>One attempt per round. Correct answers are not shown after submission.</span>
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-center pt-2">
          <Link
            href="/quiz/play"
            className="inline-flex items-center gap-2 h-12 px-8 rounded-full bg-[#c46a35] hover:bg-[#b35e2c] text-white font-semibold text-[14.5px] shadow-soft hover:-translate-y-0.5 transition-all"
          >
            {ctaLabel} →
          </Link>
        </div>
      </div>
    </div>
  );
}
