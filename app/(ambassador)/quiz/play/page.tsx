/**
 * /quiz/play — Thin server component that gates with requireAmbassador() and
 * renders the client-side QuizRunner.
 *
 * All quiz state (assign / submit) is managed inside QuizRunner itself, which
 * fetches from /api/quiz/assign on mount and POSTs to /api/quiz/submit when the
 * member finishes. This page only supplies the auth gate.
 */

import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { QuizRunner } from "@/components/quiz/quiz-runner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quiz · Yuvaah" };

export default async function QuizPlayPage() {
  // Gate — redirects to /login if not an approved ambassador.
  await requireAmbassador();

  // Render the client runner. It fetches its own view model on mount via
  // POST /api/quiz/assign (which re-checks the session server-side).
  return <QuizRunner theme="clean" />;
}
