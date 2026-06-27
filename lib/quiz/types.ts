export type AttemptAnswers = Record<string, number | null>; // questionId -> 0..3 | null
export type QuizQuestionRow = {
  id: string; round_id: string; category: string | null;
  question: string; option_a: string; option_b: string; option_c: string; option_d: string;
  correct_index: number; created_at: string;
};
export type PublicQuestion = { id: string; question: string; options: [string, string, string, string] };
export type ScoreResult = { score: number; correctCount: number; wrongCount: number; unansweredCount: number };
export type QuizViewModel = {
  attemptId: string;
  questions: PublicQuestion[];
  timeLimitSeconds: number | null;
  pointsPerCorrect: number;
  startedAtIso: string;
};
