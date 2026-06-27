import "server-only";

import { z } from "zod";

import { requireAmbassadorForApi } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreAttempt } from "@/lib/quiz/scoring";
import type { AttemptAnswers } from "@/lib/quiz/types";

/**
 * POST /api/quiz/submit
 *
 * Accepts the member's answers, scores them server-side, and credits the
 * ambassador points ledger exactly once.
 *
 * Body: { attemptId: string; answers: Record<string, number | null> }
 * Response: { score, correctCount, wrongCount, unansweredCount, pointsCredited }
 *
 * Idempotency + double-credit guard:
 *   - If the attempt is already `completed`, returns the stored result immediately
 *     (no re-scoring, no second ledger insert).
 *   - The UPDATE uses `WHERE status = 'in_progress'` so exactly one concurrent
 *     submit can win. The loser sees 0 rows updated, re-reads the stored result,
 *     and deletes the orphan ledger row it already inserted before losing.
 *
 * Security:
 *   - Ownership check: attempt.profile_id must equal the authenticated profileId.
 *   - correct_index is fetched server-side only for scoring; never returned.
 */

const AnswerValueSchema = z.union([
  z.number().int().min(0).max(3),
  z.null(),
]);

const SubmitBodySchema = z.object({
  attemptId: z.string().min(1),
  answers: z.record(z.string(), AnswerValueSchema),
});

export async function POST(req: Request) {
  // 1. Auth gate.
  const gate = await requireAmbassadorForApi();
  if (!gate.ok) return gate.response;
  const { profileId } = gate.ctx;

  // 2. Parse + validate body.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = SubmitBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request body.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { attemptId, answers } = parsed.data;
  const typedAnswers = answers as AttemptAnswers;

  const sb = createAdminClient();

  // 3. Load the attempt; verify ownership.
  const { data: attempt, error: attemptErr } = await sb
    .from("yuvaah_quiz_attempts")
    .select(
      "id, profile_id, round_id, status, assigned_question_ids, score, correct_count, wrong_count, unanswered_count, points_ledger_id",
    )
    .eq("id", attemptId)
    .maybeSingle();

  if (attemptErr) {
    return Response.json(
      { error: `Failed to load attempt: ${attemptErr.message}` },
      { status: 500 },
    );
  }
  if (!attempt) {
    return Response.json({ error: "Attempt not found." }, { status: 404 });
  }

  // Ownership check — 403 if the attempt belongs to someone else.
  if (attempt.profile_id !== profileId) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  // 3a. Already completed — return stored result (idempotent no-op).
  if (attempt.status === "completed") {
    return Response.json({
      score: attempt.score,
      correctCount: attempt.correct_count,
      wrongCount: attempt.wrong_count,
      unansweredCount: attempt.unanswered_count,
      pointsCredited: attempt.points_ledger_id !== null ? attempt.score : 0,
    });
  }

  // 4. Load the round for points_per_correct.
  const { data: round, error: roundErr } = await sb
    .from("yuvaah_quiz_rounds")
    .select("points_per_correct")
    .eq("id", attempt.round_id)
    .single();

  if (roundErr || !round) {
    return Response.json(
      { error: `Failed to load round: ${roundErr?.message ?? "no data"}` },
      { status: 500 },
    );
  }

  // 5. Load the answer key for the assigned questions — server-side only.
  const assignedIds = attempt.assigned_question_ids as string[];

  const { data: keyRows, error: keyErr } = await sb
    .from("yuvaah_quiz_questions")
    .select("id, correct_index")
    .in("id", assignedIds);

  if (keyErr || !keyRows) {
    return Response.json(
      { error: `Failed to load answer key: ${keyErr?.message ?? "no data"}` },
      { status: 500 },
    );
  }

  const keyByQuestionId: Record<string, number> = {};
  for (const row of keyRows) {
    keyByQuestionId[row.id] = row.correct_index;
  }

  // 6. Score.
  const result = scoreAttempt(
    assignedIds,
    typedAnswers,
    keyByQuestionId,
    round.points_per_correct,
  );

  // 7. Credit points + complete, guarding double-credit.
  //
  // Strategy:
  //   a. If score > 0 AND no ledger row yet: insert a ledger row first.
  //   b. Then UPDATE the attempt with status='completed' WHERE status='in_progress'.
  //   c. If 0 rows updated (concurrent submit already won): delete the ledger row
  //      we just inserted (orphan prevention) and re-read + return the stored result.

  let ledgerId: string | null = null;

  if (result.score > 0 && attempt.points_ledger_id === null) {
    const { data: ledgerRow, error: ledgerErr } = await sb
      .from("amb_points_ledger")
      .insert({
        user_id: profileId,
        delta: result.score,
        reason: "quiz_score",
        reference_id: attemptId,
      })
      .select("id")
      .single();

    if (ledgerErr || !ledgerRow) {
      return Response.json(
        {
          error: `Failed to insert points ledger: ${ledgerErr?.message ?? "no data"}`,
        },
        { status: 500 },
      );
    }

    ledgerId = ledgerRow.id;
  }

  // Update attempt — the WHERE status='in_progress' is the concurrency guard.
  // Using .select("id") and checking the returned array length is the reliable
  // way to detect whether 0 rows were matched (concurrent submit already won).
  const { data: updatedRows, error: updateErr } = await sb
    .from("yuvaah_quiz_attempts")
    .update({
      status: "completed",
      answers: typedAnswers,
      score: result.score,
      correct_count: result.correctCount,
      wrong_count: result.wrongCount,
      unanswered_count: result.unansweredCount,
      completed_at: new Date().toISOString(),
      ...(ledgerId !== null ? { points_ledger_id: ledgerId } : {}),
    })
    .eq("id", attemptId)
    .eq("status", "in_progress")
    .select("id");

  // updatedRows.length === 0 means the WHERE status='in_progress' guard rejected
  // this submit because a concurrent one already completed the attempt.
  const didUpdate = !updateErr && updatedRows !== null && updatedRows.length > 0;

  if (updateErr) {
    // Rollback orphan ledger row.
    if (ledgerId) {
      await sb.from("amb_points_ledger").delete().eq("id", ledgerId);
    }
    return Response.json(
      { error: `Failed to complete attempt: ${updateErr.message}` },
      { status: 500 },
    );
  }

  if (!didUpdate) {
    // Concurrent submit already won. Remove orphan ledger row if we inserted one.
    if (ledgerId) {
      await sb.from("amb_points_ledger").delete().eq("id", ledgerId);
    }

    // Re-read the stored result from the winning submit.
    const { data: stored, error: storedErr } = await sb
      .from("yuvaah_quiz_attempts")
      .select(
        "score, correct_count, wrong_count, unanswered_count, points_ledger_id",
      )
      .eq("id", attemptId)
      .single();

    if (storedErr || !stored) {
      return Response.json(
        { error: "Concurrent submit; failed to re-read stored result." },
        { status: 500 },
      );
    }

    return Response.json({
      score: stored.score,
      correctCount: stored.correct_count,
      wrongCount: stored.wrong_count,
      unansweredCount: stored.unanswered_count,
      pointsCredited: stored.points_ledger_id !== null ? stored.score : 0,
    });
  }

  // 8. Success — return the freshly computed result.
  return Response.json({
    score: result.score,
    correctCount: result.correctCount,
    wrongCount: result.wrongCount,
    unansweredCount: result.unansweredCount,
    pointsCredited: ledgerId !== null ? result.score : 0,
  });
}
