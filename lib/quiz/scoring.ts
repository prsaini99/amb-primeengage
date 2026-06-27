// lib/quiz/scoring.ts
import type { AttemptAnswers, ScoreResult } from "./types";

export function scoreAttempt(
  assignedIds: string[],
  answers: AttemptAnswers,
  keyByQuestionId: Record<string, number>,
  pointsPerCorrect: number,
): ScoreResult {
  let correct = 0, wrong = 0, unanswered = 0;
  for (const id of assignedIds) {
    const a = answers[id];
    if (a === null || a === undefined) { unanswered++; continue; }
    if (a === keyByQuestionId[id]) correct++; else wrong++;
  }
  return {
    score: correct * pointsPerCorrect,
    correctCount: correct, wrongCount: wrong, unansweredCount: unanswered,
  };
}
