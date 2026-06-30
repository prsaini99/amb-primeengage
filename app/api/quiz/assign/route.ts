import "server-only";

import { requireAmbassadorForApi } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";
import { drawRandom } from "@/lib/quiz/draw";
import type { PublicQuestion, QuizViewModel } from "@/lib/quiz/types";

/**
 * POST /api/quiz/assign
 *
 * Draws and locks a random set of questions for the calling ambassador against
 * the currently active round.
 *
 * Idempotency guarantees:
 *   - No active round            → { dormant: true }
 *   - Attempt already completed  → { alreadyCompleted: true, score }
 *   - Attempt already in_progress → re-use the existing assigned_question_ids
 *   - Concurrent first-call race  → unique-constraint violation on insert is
 *     handled by re-reading the row that won the race
 *
 * Security: `correct_index` is never selected from yuvaah_quiz_questions.
 * Only id, prompt, option_a..d are fetched for the client payload.
 */
export async function POST(_req: Request) {
  // 1. Auth gate.
  const gate = await requireAmbassadorForApi();
  if (!gate.ok) return gate.response;
  const { profileId } = gate.ctx;

  const sb = createAdminClient();

  // 2. Load the one active round (there can be at most one by DB constraint).
  const { data: round, error: roundErr } = await sb
    .from("yuvaah_quiz_rounds")
    .select("id, time_limit_seconds, points_per_correct, questions_per_attempt")
    .eq("status", "active")
    .maybeSingle();

  if (roundErr) {
    return Response.json(
      { error: `Failed to load active round: ${roundErr.message}` },
      { status: 500 },
    );
  }

  // No active round — quiz is dormant.
  if (!round) {
    return Response.json({ dormant: true });
  }

  // 3. Load any existing attempt for this (round, profile) pair.
  const { data: existingAttempt, error: attemptReadErr } = await sb
    .from("yuvaah_quiz_attempts")
    .select(
      "id, status, assigned_question_ids, score, started_at",
    )
    .eq("round_id", round.id)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (attemptReadErr) {
    return Response.json(
      { error: `Failed to load attempt: ${attemptReadErr.message}` },
      { status: 500 },
    );
  }

  // 3a. Already completed — return idempotent result.
  if (existingAttempt?.status === "completed") {
    return Response.json({
      alreadyCompleted: true,
      score: existingAttempt.score,
    });
  }

  // 3b. In-progress attempt exists — reuse its locked question set.
  let attemptId: string;
  let assignedIds: string[];
  let startedAtIso: string;

  if (existingAttempt && existingAttempt.status === "in_progress") {
    attemptId = existingAttempt.id;
    assignedIds = existingAttempt.assigned_question_ids as string[];
    startedAtIso = existingAttempt.started_at;
  } else {
    // 4. No attempt yet — draw a fresh random set from the pool.
    const { data: poolRows, error: poolErr } = await sb
      .from("yuvaah_quiz_questions")
      .select("id")
      .eq("round_id", round.id);

    if (poolErr) {
      return Response.json(
        { error: `Failed to load question pool: ${poolErr.message}` },
        { status: 500 },
      );
    }

    const poolIds = (poolRows ?? []).map((r) => r.id);
    const drawn = drawRandom(poolIds, round.questions_per_attempt);

    // 5. Insert the new attempt.
    const { data: inserted, error: insertErr } = await sb
      .from("yuvaah_quiz_attempts")
      .insert({
        round_id: round.id,
        profile_id: profileId,
        assigned_question_ids: drawn,
      })
      .select("id, assigned_question_ids, started_at")
      .single();

    if (insertErr) {
      // 23505 = unique_violation — a concurrent request already inserted.
      // Re-read that winning row and use it (idempotent).
      const code = (insertErr as { code?: string } | null)?.code;
      if (code === "23505") {
        const { data: racedAttempt, error: raceReadErr } = await sb
          .from("yuvaah_quiz_attempts")
          .select("id, status, assigned_question_ids, score, started_at")
          .eq("round_id", round.id)
          .eq("profile_id", profileId)
          .single();

        if (raceReadErr || !racedAttempt) {
          return Response.json(
            { error: "Concurrent assign race; failed to re-read attempt." },
            { status: 500 },
          );
        }

        // The concurrent submission might have already completed it.
        if (racedAttempt.status === "completed") {
          return Response.json({
            alreadyCompleted: true,
            score: racedAttempt.score,
          });
        }

        attemptId = racedAttempt.id;
        assignedIds = racedAttempt.assigned_question_ids as string[];
        startedAtIso = racedAttempt.started_at;
      } else {
        return Response.json(
          { error: `Failed to create attempt: ${insertErr.message}` },
          { status: 500 },
        );
      }
    } else {
      if (!inserted) {
        return Response.json(
          { error: "Attempt insert returned no data." },
          { status: 500 },
        );
      }
      attemptId = inserted.id;
      assignedIds = inserted.assigned_question_ids as string[];
      startedAtIso = inserted.started_at;
    }
  }

  // 6. Fetch public question data — never select correct_index.
  const { data: questionRows, error: qErr } = await sb
    .from("yuvaah_quiz_questions")
    .select("id, question, option_a, option_b, option_c, option_d")
    .in("id", assignedIds);

  if (qErr || !questionRows) {
    return Response.json(
      { error: `Failed to load questions: ${qErr?.message ?? "no data"}` },
      { status: 500 },
    );
  }

  // Build a lookup map and re-order to match assigned order.
  const questionMap = new Map(questionRows.map((q) => [q.id, q]));
  const questions: PublicQuestion[] = assignedIds
    .map((id) => {
      const q = questionMap.get(id);
      if (!q) return null;
      return {
        id: q.id,
        question: q.question,
        options: [q.option_a, q.option_b, q.option_c, q.option_d] as [
          string,
          string,
          string,
          string,
        ],
      };
    })
    .filter((q): q is PublicQuestion => q !== null);

  // 7. Build and return the view model — no answer key included.
  const viewModel: QuizViewModel = {
    attemptId,
    questions,
    // Normalize 0 / null / undefined → null (means "no timer").
    timeLimitSeconds:
      round.time_limit_seconds && round.time_limit_seconds > 0
        ? round.time_limit_seconds
        : null,
    pointsPerCorrect: round.points_per_correct,
    startedAtIso,
  };

  return Response.json({ viewModel });
}
