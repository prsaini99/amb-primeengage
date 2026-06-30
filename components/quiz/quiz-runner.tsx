"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { QuestionCard } from "./question-card";
import { QuizTimer } from "./quiz-timer";
import type { QuestionCardTheme } from "./question-card";
import type { QuizViewModel } from "@/lib/quiz/types";

export type QuizRunnerProps = {
  /** Chosen theme — default "clean". */
  theme?: QuestionCardTheme;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeRemainingSeconds(
  startedAtIso: string,
  timeLimitSeconds: number,
): number {
  const elapsed = (Date.now() - new Date(startedAtIso).getTime()) / 1000;
  return Math.max(0, timeLimitSeconds - elapsed);
}

// ---------------------------------------------------------------------------
// QuizRunner
// ---------------------------------------------------------------------------

export function QuizRunner({ theme = "clean" }: QuizRunnerProps) {
  // ---------------------------------------------------------------------------
  // State machine
  // ---------------------------------------------------------------------------
  // "loading"     — fetching view model from /api/quiz/assign
  // "error"       — assign fetch failed (network or server error)
  // "ready"       — view model loaded; quiz is in progress
  // "submitting"  — POST /api/quiz/submit in flight
  // "submitError" — submit failed (network or server error)
  type Phase =
    | { name: "loading" }
    | { name: "error"; message: string }
    | { name: "ready"; viewModel: QuizViewModel }
    | { name: "submitting"; viewModel: QuizViewModel }
    | { name: "submitError"; viewModel: QuizViewModel; message: string };

  const [phase, setPhase] = useState<Phase>({ name: "loading" });

  // answers keyed by question id; initialised once viewModel arrives
  const [answers, setAnswers] = useState<Record<string, number | null>>({});

  // Ref kept in sync with answers so the timer's stale closure always reads
  // the latest answers, not the initial all-null snapshot.
  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // current question index
  const [currentIndex, setCurrentIndex] = useState(0);

  // timer — initialised deterministically to timeLimitSeconds (avoids SSR
  // hydration mismatch). The tick effect adjusts to actual elapsed time on mount.
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  // ---------------------------------------------------------------------------
  // On mount: call /api/quiz/assign
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function assign() {
      try {
        const res = await fetch("/api/quiz/assign", { method: "POST" });
        if (cancelled) return;

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setPhase({
            name: "error",
            message: (body as { error?: string }).error ?? `Server error ${res.status}`,
          });
          return;
        }

        const body = (await res.json()) as
          | { dormant: true }
          | { alreadyCompleted: true; score: number }
          | { viewModel: QuizViewModel };

        if (cancelled) return;

        if ("dormant" in body && body.dormant) {
          // No active round — hard-navigate back to the landing page.
          window.location.assign("/quiz");
          return;
        }

        if ("alreadyCompleted" in body && body.alreadyCompleted) {
          // Already done — hard-navigate back to the landing page.
          window.location.assign("/quiz");
          return;
        }

        if ("viewModel" in body) {
          const vm = body.viewModel;
          // Initialise answers and timer.
          setAnswers(Object.fromEntries(vm.questions.map((q) => [q.id, null])));
          setRemainingSeconds(vm.timeLimitSeconds ?? 0);
          setPhase({ name: "ready", viewModel: vm });
        } else {
          setPhase({ name: "error", message: "Unexpected response from server." });
        }
      } catch (err) {
        if (cancelled) return;
        setPhase({
          name: "error",
          message: err instanceof Error ? err.message : "Network error",
        });
      }
    }

    assign();
    return () => { cancelled = true; };
  }, []);

  // ---------------------------------------------------------------------------
  // Submit handler — POSTs to /api/quiz/submit, then hard-navs to /quiz/result
  // ---------------------------------------------------------------------------
  const handleSubmit = useCallback(async () => {
    if (phase.name !== "ready") return;
    const { viewModel } = phase;
    setPhase({ name: "submitting", viewModel });

    try {
      const res = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: viewModel.attemptId, answers: answersRef.current }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPhase({
          name: "submitError",
          viewModel,
          message: (body as { error?: string }).error ?? `Server error ${res.status}`,
        });
        return;
      }

      // Score is stored server-side; result page re-reads it. Hard-navigate to
      // avoid Next 16 soft-nav redirect-chain issues.
      window.location.assign("/quiz/result");
    } catch (err) {
      setPhase({
        name: "submitError",
        viewModel,
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }, [phase]);

  // Stable refs used inside the timer so we don't need to include them in deps.
  // The timer only starts once (when phase transitions to "ready") and is keyed
  // on the attemptId, so stale-closure risk is nil.
  const viewModelForTimer =
    phase.name === "ready" ? phase.viewModel : null;
  const attemptIdForTimer = viewModelForTimer?.attemptId ?? null;

  // ---------------------------------------------------------------------------
  // Timer tick — only active when the quiz is in "ready" state with a time limit
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!viewModelForTimer) return;
    if (viewModelForTimer.timeLimitSeconds === null || viewModelForTimer.timeLimitSeconds <= 0) return;

    const startedAtIso = viewModelForTimer.startedAtIso;
    const timeLimitSeconds = viewModelForTimer.timeLimitSeconds;

    const tick = () => {
      const remaining = computeRemainingSeconds(startedAtIso, timeLimitSeconds);
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        handleSubmit();
      }
    };

    tick(); // immediate sync
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // handleSubmit is memoised on phase; it captures the correct viewModel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptIdForTimer]);

  // ---------------------------------------------------------------------------
  // Theme tokens
  // ---------------------------------------------------------------------------
  const wrapperStyles: Record<QuestionCardTheme, string> = {
    clean: "min-h-screen bg-paper",
    brand: "min-h-screen brand-gradient",
    playful: "min-h-screen bg-paper dotted",
  };

  const headerStyles: Record<QuestionCardTheme, string> = {
    clean: "sticky top-0 z-10 bg-paper/80 backdrop-blur border-b border-line",
    brand: "sticky top-0 z-10 bg-navy-900/80 backdrop-blur border-b border-cyan-500/20",
    playful: "sticky top-0 z-10 bg-paper/90 backdrop-blur border-b-2 border-amber-200/60",
  };

  const headerInnerStyles: Record<QuestionCardTheme, string> = {
    clean: "max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between",
    brand: "max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between",
    playful: "max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between",
  };

  const titleStyles: Record<QuestionCardTheme, string> = {
    clean: "font-display font-semibold text-navy-900 text-[15px]",
    brand: "font-display font-semibold text-white text-[15px]",
    playful: "font-display font-bold text-navy-900 text-[15px]",
  };

  const progressBarBg: Record<QuestionCardTheme, string> = {
    clean: "bg-line-strong",
    brand: "bg-white/10",
    playful: "bg-amber-100",
  };

  const progressBarFill: Record<QuestionCardTheme, string> = {
    clean: "bg-gradient-to-r from-navy-600 to-cyan-500",
    brand: "bg-gradient-to-r from-cyan-500 to-cyan-300",
    playful: "bg-gradient-to-r from-amber-400 to-[#c46a35]",
  };

  const navGridStyles: Record<QuestionCardTheme, { wrapper: string; answered: string; current: string; unanswered: string }> = {
    clean: {
      wrapper: "flex flex-wrap gap-2",
      answered: "h-8 w-8 rounded-lg bg-cyan-50 ring-1 ring-cyan-300/60 text-navy-800 font-semibold text-[12px] grid place-items-center cursor-pointer hover:ring-cyan-500",
      current: "h-8 w-8 rounded-lg bg-navy-800 text-white font-semibold text-[12px] grid place-items-center cursor-pointer",
      unanswered: "h-8 w-8 rounded-lg bg-paper-2 ring-1 ring-line text-mute text-[12px] font-semibold grid place-items-center cursor-pointer hover:ring-navy-800/40",
    },
    brand: {
      wrapper: "flex flex-wrap gap-2",
      answered: "h-8 w-8 rounded-lg bg-cyan-500/20 ring-1 ring-cyan-400/50 text-cyan-300 font-semibold text-[12px] grid place-items-center cursor-pointer hover:ring-cyan-400",
      current: "h-8 w-8 rounded-lg bg-cyan-400 text-navy-900 font-semibold text-[12px] grid place-items-center cursor-pointer",
      unanswered: "h-8 w-8 rounded-lg bg-white/10 ring-1 ring-white/20 text-white/50 text-[12px] font-semibold grid place-items-center cursor-pointer hover:ring-white/40",
    },
    playful: {
      wrapper: "flex flex-wrap gap-2",
      answered: "h-9 w-9 rounded-full bg-amber-400/20 ring-2 ring-amber-400/60 text-amber-600 font-bold text-[12px] grid place-items-center cursor-pointer hover:ring-amber-500",
      current: "h-9 w-9 rounded-full bg-[#c46a35] text-white font-bold text-[12px] grid place-items-center cursor-pointer",
      unanswered: "h-9 w-9 rounded-full bg-paper-2 ring-2 ring-amber-200/50 text-mute text-[12px] font-bold grid place-items-center cursor-pointer hover:ring-amber-300",
    },
  };

  const btnStyles: Record<QuestionCardTheme, { prev: string; next: string; submit: string }> = {
    clean: {
      prev: "h-10 px-5 rounded-full ring-1 ring-line bg-paper-2 text-navy-800 text-[13.5px] font-semibold hover:ring-navy-800/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all",
      next: "h-10 px-5 rounded-full bg-navy-800 text-white text-[13.5px] font-semibold hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all",
      submit: "h-10 px-6 rounded-full bg-amber-500 hover:bg-amber-400 text-white text-[13.5px] font-semibold shadow-soft hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all",
    },
    brand: {
      prev: "h-10 px-5 rounded-full ring-1 ring-white/20 bg-white/10 text-white text-[13.5px] font-semibold hover:ring-white/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all",
      next: "h-10 px-5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-navy-900 text-[13.5px] font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-all",
      submit: "h-10 px-6 rounded-full bg-cyan-400 hover:bg-cyan-300 text-navy-900 text-[13.5px] font-semibold shadow-brand hover:-translate-y-0.5 disabled:opacity-30 disabled:cursor-not-allowed transition-all",
    },
    playful: {
      prev: "h-10 px-5 rounded-full ring-2 ring-amber-200 bg-paper-2 text-navy-800 text-[13.5px] font-bold hover:ring-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all",
      next: "h-10 px-5 rounded-full bg-amber-400 hover:bg-amber-500 text-white text-[13.5px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all",
      submit: "h-10 px-6 rounded-full font-bold text-[13.5px] text-white hover:-translate-y-0.5 shadow-soft disabled:opacity-40 disabled:cursor-not-allowed transition-all",
    },
  };

  const navigatorSectionStyles: Record<QuestionCardTheme, string> = {
    clean: "bg-paper-2 ring-1 ring-line rounded-2xl p-4",
    brand: "bg-navy-900/40 ring-1 ring-white/10 rounded-2xl p-4 backdrop-blur",
    playful: "bg-paper-2 ring-2 ring-amber-200/50 rounded-3xl p-4",
  };

  const navigatorTitleStyles: Record<QuestionCardTheme, string> = {
    clean: "text-[11px] font-semibold uppercase tracking-[0.18em] text-mute mb-3",
    brand: "text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-400/80 mb-3",
    playful: "text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500 mb-3",
  };

  // ---------------------------------------------------------------------------
  // Render: loading
  // ---------------------------------------------------------------------------
  if (phase.name === "loading") {
    return (
      <div className={wrapperStyles[theme]}>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div
            className={cn(
              "inline-block h-8 w-8 rounded-full border-2 animate-spin",
              theme === "brand"
                ? "border-cyan-400 border-t-transparent"
                : "border-navy-800 border-t-transparent",
            )}
            role="status"
            aria-label="Loading quiz…"
          />
          <p
            className={cn(
              "mt-4 text-[13.5px]",
              theme === "brand" ? "text-white/60" : "text-mute",
            )}
          >
            Loading your quiz…
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: assign error (with retry)
  // ---------------------------------------------------------------------------
  if (phase.name === "error") {
    return (
      <div className={wrapperStyles[theme]}>
        <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
          <p
            className={cn(
              "font-semibold text-[15px]",
              theme === "brand" ? "text-white" : "text-navy-900",
            )}
          >
            Couldn&apos;t load quiz
          </p>
          <p
            className={cn(
              "text-[13.5px]",
              theme === "brand" ? "text-white/60" : "text-mute",
            )}
          >
            {phase.message}
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase({ name: "loading" });
              // Re-trigger the assign effect by navigating to same page
              window.location.assign("/quiz/play");
            }}
            className="h-10 px-6 rounded-full bg-[#c46a35] hover:bg-[#b35e2c] text-white font-semibold text-[13.5px] transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Extract the viewModel from ready / submitting / submitError phases
  // ---------------------------------------------------------------------------
  const viewModel = phase.viewModel;
  const { questions, timeLimitSeconds } = viewModel;
  const total = questions.length;

  const isSubmitting = phase.name === "submitting";

  // ---------------------------------------------------------------------------
  // Render: quiz in progress (ready / submitting / submitError)
  // ---------------------------------------------------------------------------
  const currentQ = questions[currentIndex];
  const progressPct = Math.round(((currentIndex + 1) / total) * 100);
  const answeredCount = Object.values(answers).filter((v) => v !== null).length;
  const isLast = currentIndex === total - 1;

  return (
    <div className={wrapperStyles[theme]}>
      {/* Sticky header */}
      <header className={headerStyles[theme]}>
        <div className={headerInnerStyles[theme]}>
          <span className={titleStyles[theme]}>Yuvaah Club Quiz</span>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "text-[12px] font-mono",
                theme === "brand" ? "text-white/60" : "text-mute",
              )}
            >
              {answeredCount}/{total} answered
            </span>
            {timeLimitSeconds !== null && timeLimitSeconds > 0 && (
              <QuizTimer remainingSeconds={remainingSeconds} theme={theme} />
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className={cn("h-0.5", progressBarBg[theme])}>
          <div
            className={cn("h-full transition-all duration-300", progressBarFill[theme])}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 md:py-8 flex flex-col gap-6">
        {/* Submit error banner */}
        {phase.name === "submitError" && (
          <div className="bg-amber-500/10 ring-1 ring-amber-500/40 rounded-xl px-5 py-3 flex items-center gap-3">
            <span className="text-amber-500 text-[13.5px] flex-1">
              Submit failed: {phase.message}. Your answers are still saved — please
              try again.
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              className="shrink-0 h-8 px-4 rounded-full bg-amber-500 hover:bg-amber-400 text-white font-semibold text-[12.5px] transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {/* Question card */}
        <QuestionCard
          index={currentIndex}
          total={total}
          question={currentQ}
          selected={answers[currentQ.id] ?? null}
          onSelect={(i) =>
            setAnswers((prev) => ({ ...prev, [currentQ.id]: i }))
          }
          theme={theme}
        />

        {/* Question navigator */}
        <div className={navigatorSectionStyles[theme]}>
          <p className={navigatorTitleStyles[theme]}>Question navigator</p>
          <div className={navGridStyles[theme].wrapper}>
            {questions.map((q, i) => {
              const isAnswered = answers[q.id] !== null;
              const isCurrent = i === currentIndex;
              const cls = isCurrent
                ? navGridStyles[theme].current
                : isAnswered
                  ? navGridStyles[theme].answered
                  : navGridStyles[theme].unanswered;
              return (
                <button
                  key={q.id}
                  type="button"
                  aria-label={`Go to question ${i + 1}${isAnswered ? " (answered)" : ""}`}
                  aria-current={isCurrent ? "step" : undefined}
                  onClick={() => setCurrentIndex(i)}
                  className={cls}
                  disabled={isSubmitting}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Prev / Next / Submit controls */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={currentIndex === 0 || isSubmitting}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            className={btnStyles[theme].prev}
          >
            ← Prev
          </button>

          <div className="flex items-center gap-3">
            {!isLast && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
                className={btnStyles[theme].next}
              >
                Next →
              </button>
            )}

            {/* Submit — disabled while request is in flight */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={cn(
                btnStyles[theme].submit,
                theme === "playful" && "bg-[#c46a35] hover:bg-[#b35e2c]",
              )}
            >
              {isSubmitting ? "Submitting…" : "Submit quiz"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
