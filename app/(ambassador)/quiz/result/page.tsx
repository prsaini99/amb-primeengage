/**
 * /quiz/result — Shows the member's most-recent completed attempt for the
 * active round (or the most-recently-closed round if none is active).
 *
 * Server component. Result is read fresh from the DB — the score is NEVER
 * passed via query string. Correct answers are NOT shown.
 *
 * Auth gate: requireAmbassador() — redirects on failure.
 */

import Link from "next/link";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";
import { ResultCard } from "@/components/quiz/result-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quiz Result · Yuvaah" };

export default async function QuizResultPage() {
  const { profileId } = await requireAmbassador();
  const sb = createAdminClient();

  // 1. Find the most-recently-completed attempt for this member, joined to the
  //    round so we know points_per_correct and questions_per_attempt (for maxScore).
  //    We prefer the active round, then fall back to any completed attempt ordered
  //    by completed_at desc so the member always sees their last submission.
  const { data: attempt } = await sb
    .from("yuvaah_quiz_attempts")
    .select(
      "id, score, correct_count, wrong_count, unanswered_count, points_ledger_id, round_id, completed_at",
    )
    .eq("profile_id", profileId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2. No completed attempt at all — edge case (member navigated here directly).
  if (!attempt) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="h-16 w-16 rounded-2xl bg-paper-2 ring-1 ring-line grid place-items-center text-3xl mb-6">
          📋
        </div>
        <h1 className="font-display text-2xl font-semibold text-navy-900 mb-2">
          No result yet
        </h1>
        <p className="text-[14px] text-mute max-w-sm mb-6">
          You haven&apos;t completed a quiz round yet. Head to the quiz landing
          page to get started.
        </p>
        <Link
          href="/quiz"
          className="inline-flex items-center gap-2 h-10 px-6 rounded-full bg-[#c46a35] hover:bg-[#b35e2c] text-white font-semibold text-[13.5px] transition-all"
        >
          Go to quiz →
        </Link>
      </div>
    );
  }

  // 3. Load the round for maxScore calculation.
  const { data: round } = await sb
    .from("yuvaah_quiz_rounds")
    .select("title, points_per_correct, questions_per_attempt")
    .eq("id", attempt.round_id)
    .maybeSingle();

  const pointsPerCorrect = round?.points_per_correct ?? 10;
  const totalQuestions = round?.questions_per_attempt ?? 10;
  const maxScore = totalQuestions * pointsPerCorrect;

  const score = attempt.score ?? 0;
  const correctCount = attempt.correct_count ?? 0;
  const wrongCount = attempt.wrong_count ?? 0;
  const unansweredCount = attempt.unanswered_count ?? 0;
  // pointsCredited = score if a ledger row was written, else 0 (score was 0).
  const pointsCredited = attempt.points_ledger_id !== null ? score : 0;

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-mute mb-1">
            Yuvaah Club Quiz
          </p>
          {round?.title && (
            <h1 className="font-display text-2xl font-semibold text-navy-900">
              {round.title}
            </h1>
          )}
        </div>

        {/* Result — correct answers are intentionally NOT shown here */}
        <ResultCard
          score={score}
          correctCount={correctCount}
          wrongCount={wrongCount}
          unansweredCount={unansweredCount}
          pointsCredited={pointsCredited}
          maxScore={maxScore}
          theme="clean"
        />

        {/* Navigation */}
        <div className="flex justify-center pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 h-10 px-6 rounded-full ring-1 ring-line bg-paper-2 text-navy-800 font-semibold text-[13.5px] hover:ring-navy-800/40 transition-all"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
