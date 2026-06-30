"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseQuestionsCsv } from "@/lib/quiz/csv";

export type RoundFormResult =
  | { ok: false; error: string }
  | { ok: true };

// ---------- helpers ----------------------------------------------------------

type ParsedRound =
  | {
      ok: true;
      title: string;
      description: string | null;
      time_limit_seconds: number | null;
      points_per_correct: number;
      questions_per_attempt: number;
    }
  | { ok: false; error: string };

function parseRoundForm(formData: FormData): ParsedRound {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const timeLimitRaw = String(formData.get("time_limit_seconds") ?? "").trim();
  const pointsRaw = String(formData.get("points_per_correct") ?? "").trim();
  const questionsRaw = String(formData.get("questions_per_attempt") ?? "").trim();

  if (!title || title.length > 200) {
    return { ok: false, error: "Title is required (max 200 chars)." };
  }

  let time_limit_seconds: number | null = null;
  if (timeLimitRaw !== "") {
    const v = Number(timeLimitRaw);
    if (!Number.isInteger(v) || v < 0) {
      return { ok: false, error: "Time limit must be a whole number ≥ 0, or leave blank for no limit." };
    }
    time_limit_seconds = v;
  }

  const points_per_correct = pointsRaw === "" ? 10 : Number(pointsRaw);
  if (!Number.isInteger(points_per_correct) || points_per_correct < 0) {
    return { ok: false, error: "Points per correct must be a whole number ≥ 0." };
  }

  const questions_per_attempt = questionsRaw === "" ? 10 : Number(questionsRaw);
  if (!Number.isInteger(questions_per_attempt) || questions_per_attempt < 1) {
    return { ok: false, error: "Questions per attempt must be a whole number > 0." };
  }

  return {
    ok: true,
    title,
    description,
    time_limit_seconds,
    points_per_correct,
    questions_per_attempt,
  };
}

// ---------- createRound ------------------------------------------------------

export async function createRound(
  _prev: RoundFormResult | null,
  formData: FormData,
): Promise<RoundFormResult | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const parsed = parseRoundForm(formData);
  if (!parsed.ok) return parsed;

  const sb = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .insert({
      title: parsed.title,
      description: parsed.description,
      time_limit_seconds: parsed.time_limit_seconds,
      points_per_correct: parsed.points_per_correct,
      questions_per_attempt: parsed.questions_per_attempt,
      created_by: gate.profileId,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }

  revalidatePath("/admin/quizzes");
  redirect(`/admin/quizzes/${data.id}`);
}

// ---------- updateRound ------------------------------------------------------

export async function updateRound(
  id: string,
  _prev: RoundFormResult | null,
  formData: FormData,
): Promise<RoundFormResult | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const sb = createAdminClient();

  // Draft + active rounds are editable. Active edits are intentional and
  // affect the live quiz (admin-controlled). Closed rounds are historical and
  // stay read-only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: round, error: fetchErr } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !round) {
    return { ok: false, error: fetchErr?.message ?? "Round not found." };
  }
  if (round.status === "closed") {
    return { ok: false, error: "Closed rounds are read-only and cannot be edited." };
  }

  const parsed = parseRoundForm(formData);
  if (!parsed.ok) return parsed;

  // Guardrail: an active round is live, so questions_per_attempt must never
  // exceed the current pool size — otherwise the per-attempt random draw would
  // fail for members mid-round.
  if (round.status === "active") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: poolSize, error: countErr } = await (sb as any)
      .from("yuvaah_quiz_questions")
      .select("*", { head: true, count: "exact" })
      .eq("round_id", id);
    if (countErr) return { ok: false, error: countErr.message };
    const pool = poolSize ?? 0;
    if (parsed.questions_per_attempt > pool) {
      return {
        ok: false,
        error: `Questions per attempt (${parsed.questions_per_attempt}) can't exceed the live pool size (${pool}). Add more questions first.`,
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .update({
      title: parsed.title,
      description: parsed.description,
      time_limit_seconds: parsed.time_limit_seconds,
      points_per_correct: parsed.points_per_correct,
      questions_per_attempt: parsed.questions_per_attempt,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/quizzes");
  revalidatePath(`/admin/quizzes/${id}`);
  return { ok: true };
}

// ---------- activateRound ----------------------------------------------------

export async function activateRound(id: string): Promise<RoundFormResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const sb = createAdminClient();

  // Verify round is draft.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: round, error: fetchErr } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .select("status, questions_per_attempt")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !round) {
    return { ok: false, error: fetchErr?.message ?? "Round not found." };
  }
  if (round.status !== "draft") {
    return { ok: false, error: "Only draft rounds can be activated." };
  }

  // Verify pool size ≥ questions_per_attempt.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: poolSize, error: countErr } = await (sb as any)
    .from("yuvaah_quiz_questions")
    .select("*", { head: true, count: "exact" })
    .eq("round_id", id);

  if (countErr) {
    return { ok: false, error: countErr.message };
  }

  const pool = poolSize ?? 0;
  if (pool < round.questions_per_attempt) {
    return {
      ok: false,
      error: `Add at least ${round.questions_per_attempt} question${round.questions_per_attempt === 1 ? "" : "s"} before activating. Pool currently has ${pool}.`,
    };
  }

  // Set status='active'. If the single-active partial unique index is violated
  // Postgres returns error code 23505.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .update({ status: "active", activated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) {
    if (updateErr.code === "23505") {
      return { ok: false, error: "Another round is already active. Deactivate it first." };
    }
    return { ok: false, error: updateErr.message };
  }

  revalidatePath("/admin/quizzes");
  revalidatePath(`/admin/quizzes/${id}`);
  return { ok: true };
}

// ---------- deactivateRound --------------------------------------------------

export async function deactivateRound(id: string): Promise<RoundFormResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const sb = createAdminClient();

  // Only from active.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: round, error: fetchErr } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !round) {
    return { ok: false, error: fetchErr?.message ?? "Round not found." };
  }
  if (round.status !== "active") {
    return { ok: false, error: "Only active rounds can be deactivated." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath("/admin/quizzes");
  revalidatePath(`/admin/quizzes/${id}`);
  return { ok: true };
}

// ---------- deleteRound ------------------------------------------------------

/**
 * Hard-delete a round (any status). FK cascades remove its question pool and
 * every attempt record (yuvaah_quiz_questions / yuvaah_quiz_attempts both
 * reference the round ON DELETE CASCADE).
 *
 * Points already credited to members in amb_points_ledger are deliberately
 * NOT touched: deleting an attempt does not delete its ledger row (the
 * attempt→ledger FK is ON DELETE SET NULL, not the reverse), so members keep
 * what they earned. The UI requires a typed confirmation when participants
 * exist, so this destructive cascade is never a surprise.
 */
export async function deleteRound(id: string): Promise<RoundFormResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const sb = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: round, error: fetchErr } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!round) return { ok: false, error: "Round not found." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/quizzes");
  return { ok: true };
}

// =============================================================================
// Question pool actions (Task 14)
// =============================================================================

export type QuestionFormResult =
  | { ok: false; error: string }
  | { ok: true };

export type CsvUploadResult =
  | { ok: false; error: string; errors?: { line: number; message: string }[] }
  | { ok: true; inserted: number };

// ---------- helpers ----------------------------------------------------------

type ParsedQuestion = {
  ok: true;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_index: number;
  category: string | null;
} | { ok: false; error: string };

function parseQuestionForm(formData: FormData): ParsedQuestion {
  const question = String(formData.get("question") ?? "").trim();
  const option_a = String(formData.get("option_a") ?? "").trim();
  const option_b = String(formData.get("option_b") ?? "").trim();
  const option_c = String(formData.get("option_c") ?? "").trim();
  const option_d = String(formData.get("option_d") ?? "").trim();
  const correctRaw = String(formData.get("correct_index") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();

  if (!question) return { ok: false, error: "Question is required." };
  if (!option_a) return { ok: false, error: "Option A is required." };
  if (!option_b) return { ok: false, error: "Option B is required." };
  if (!option_c) return { ok: false, error: "Option C is required." };
  if (!option_d) return { ok: false, error: "Option D is required." };

  const correct_index = Number(correctRaw);
  if (!Number.isInteger(correct_index) || correct_index < 0 || correct_index > 3) {
    return { ok: false, error: "Correct answer must be 0, 1, 2, or 3." };
  }

  return {
    ok: true,
    question,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_index,
    category: categoryRaw || null,
  };
}

/** Fetch the round's status to enforce draft-only guard. */
async function getRoundStatus(
  sb: ReturnType<typeof createAdminClient>,
  roundId: string,
): Promise<{ status: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .select("status")
    .eq("id", roundId)
    .maybeSingle();
  if (error || !data) return null;
  return data as { status: string };
}

// ---------- addQuestion ------------------------------------------------------

export async function addQuestion(
  roundId: string,
  _prev: QuestionFormResult | null,
  formData: FormData,
): Promise<QuestionFormResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const sb = createAdminClient();

  const roundStatus = await getRoundStatus(sb, roundId);
  if (!roundStatus) return { ok: false, error: "Round not found." };
  if (roundStatus.status === "closed") {
    return { ok: false, error: "This round is closed — its question pool is read-only." };
  }

  const parsed = parseQuestionForm(formData);
  if (!parsed.ok) return parsed;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any)
    .from("yuvaah_quiz_questions")
    .insert({
      round_id: roundId,
      question: parsed.question,
      option_a: parsed.option_a,
      option_b: parsed.option_b,
      option_c: parsed.option_c,
      option_d: parsed.option_d,
      correct_index: parsed.correct_index,
      category: parsed.category,
    });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/quizzes/${roundId}/questions`);
  revalidatePath(`/admin/quizzes/${roundId}`);
  return { ok: true };
}

// ---------- updateQuestion ---------------------------------------------------

export async function updateQuestion(
  questionId: string,
  _prev: QuestionFormResult | null,
  formData: FormData,
): Promise<QuestionFormResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const sb = createAdminClient();

  // Look up the question to get its round_id, then check draft status.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: question, error: qErr } = await (sb as any)
    .from("yuvaah_quiz_questions")
    .select("id, round_id")
    .eq("id", questionId)
    .maybeSingle();

  if (qErr || !question) {
    return { ok: false, error: qErr?.message ?? "Question not found." };
  }

  const roundStatus = await getRoundStatus(sb, question.round_id as string);
  if (!roundStatus) return { ok: false, error: "Round not found." };
  if (roundStatus.status === "closed") {
    return { ok: false, error: "This round is closed — its question pool is read-only." };
  }

  const parsed = parseQuestionForm(formData);
  if (!parsed.ok) return parsed;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any)
    .from("yuvaah_quiz_questions")
    .update({
      question: parsed.question,
      option_a: parsed.option_a,
      option_b: parsed.option_b,
      option_c: parsed.option_c,
      option_d: parsed.option_d,
      correct_index: parsed.correct_index,
      category: parsed.category,
    })
    .eq("id", questionId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/quizzes/${question.round_id as string}/questions`);
  revalidatePath(`/admin/quizzes/${question.round_id as string}`);
  return { ok: true };
}

// ---------- deleteQuestion ---------------------------------------------------

export async function deleteQuestion(
  questionId: string,
): Promise<QuestionFormResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const sb = createAdminClient();

  // Look up the question to get its round_id, then check draft status.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: question, error: qErr } = await (sb as any)
    .from("yuvaah_quiz_questions")
    .select("id, round_id")
    .eq("id", questionId)
    .maybeSingle();

  if (qErr || !question) {
    return { ok: false, error: qErr?.message ?? "Question not found." };
  }

  // Need status + questions_per_attempt for the live-pool guardrail.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: round, error: rErr } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .select("status, questions_per_attempt")
    .eq("id", question.round_id as string)
    .maybeSingle();
  if (rErr || !round) return { ok: false, error: rErr?.message ?? "Round not found." };
  if (round.status === "closed") {
    return { ok: false, error: "This round is closed — its question pool is read-only." };
  }

  // Guardrail: a live round's pool must never drop below questions_per_attempt,
  // or the per-attempt draw would fail for members.
  if (round.status === "active") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: poolSize, error: countErr } = await (sb as any)
      .from("yuvaah_quiz_questions")
      .select("*", { head: true, count: "exact" })
      .eq("round_id", question.round_id as string);
    if (countErr) return { ok: false, error: countErr.message };
    if ((poolSize ?? 0) - 1 < (round.questions_per_attempt as number)) {
      return {
        ok: false,
        error: `Can't delete — a live round needs at least ${round.questions_per_attempt} question${round.questions_per_attempt === 1 ? "" : "s"} in the pool.`,
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any)
    .from("yuvaah_quiz_questions")
    .delete()
    .eq("id", questionId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/quizzes/${question.round_id as string}/questions`);
  revalidatePath(`/admin/quizzes/${question.round_id as string}`);
  return { ok: true };
}

// ---------- uploadQuestionsCsv -----------------------------------------------

export async function uploadQuestionsCsv(
  roundId: string,
  formData: FormData,
): Promise<CsvUploadResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Not authorized." };

  const sb = createAdminClient();

  const roundStatus = await getRoundStatus(sb, roundId);
  if (!roundStatus) return { ok: false, error: "Round not found." };
  if (roundStatus.status === "closed") {
    return { ok: false, error: "This round is closed — its question pool is read-only." };
  }

  const file = formData.get("csv_file") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, error: "No CSV file provided." };
  }

  const text = await file.text();
  const result = parseQuestionsCsv(text);

  if (!result.ok) {
    // All-or-nothing: do NOT insert anything; return per-line errors.
    return { ok: false, error: "CSV contains errors — nothing was inserted.", errors: result.errors };
  }

  // Bulk-insert all rows.
  const rows = result.rows.map((q) => ({
    round_id: roundId,
    question: q.question,
    option_a: q.options[0],
    option_b: q.options[1],
    option_c: q.options[2],
    option_d: q.options[3],
    correct_index: q.correct_index,
    category: q.category,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any)
    .from("yuvaah_quiz_questions")
    .insert(rows);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/quizzes/${roundId}/questions`);
  revalidatePath(`/admin/quizzes/${roundId}`);
  return { ok: true, inserted: rows.length };
}
