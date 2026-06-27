import { cn } from "@/lib/utils";
import type { QuestionCardTheme } from "./question-card";

export type ResultCardProps = {
  score: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  pointsCredited: number;
  maxScore: number;
  theme?: QuestionCardTheme;
};

export function ResultCard({
  score,
  correctCount,
  wrongCount,
  unansweredCount,
  pointsCredited,
  maxScore,
  theme = "clean",
}: ResultCardProps) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  const wrapperStyles: Record<QuestionCardTheme, string> = {
    clean: "bg-paper-2 ring-1 ring-line shadow-soft rounded-2xl p-6 md:p-8 text-center",
    brand: "bg-navy-800/60 ring-1 ring-cyan-500/20 rounded-2xl p-6 md:p-8 text-center backdrop-blur",
    playful: "bg-paper-2 ring-2 ring-amber-300/50 rounded-3xl p-6 md:p-8 text-center shadow-soft",
  };

  const titleStyles: Record<QuestionCardTheme, string> = {
    clean: "font-display text-[15px] font-semibold uppercase tracking-[0.18em] text-mute",
    brand: "font-display text-[15px] font-semibold uppercase tracking-[0.18em] text-cyan-400",
    playful: "font-display text-[15px] font-bold uppercase tracking-[0.18em] text-amber-500",
  };

  const scoreStyles: Record<QuestionCardTheme, string> = {
    clean: "font-display text-6xl md:text-7xl font-bold text-navy-900",
    brand: "font-display text-6xl md:text-7xl font-bold text-white",
    playful: "font-display text-6xl md:text-7xl font-bold text-[#c46a35]",
  };

  const maxScoreStyles: Record<QuestionCardTheme, string> = {
    clean: "text-mute text-[15px]",
    brand: "text-white/50 text-[15px]",
    playful: "text-mute text-[15px]",
  };

  const progressBg: Record<QuestionCardTheme, string> = {
    clean: "bg-paper ring-1 ring-line",
    brand: "bg-navy-900/50",
    playful: "bg-amber-50 ring-2 ring-amber-200/50",
  };

  const progressFill: Record<QuestionCardTheme, string> = {
    clean: "bg-gradient-to-r from-cyan-500 to-cyan-400",
    brand: "bg-gradient-to-r from-navy-600 to-cyan-500",
    playful: "bg-gradient-to-r from-amber-500 to-[#c46a35]",
  };

  const statCardStyles: Record<QuestionCardTheme, { wrapper: string; value: string; label: string }> = {
    clean: {
      wrapper: "bg-paper rounded-xl p-4 ring-1 ring-line",
      value: "font-display text-2xl font-bold",
      label: "text-[11.5px] text-mute font-medium uppercase tracking-wider mt-1",
    },
    brand: {
      wrapper: "bg-navy-900/50 rounded-xl p-4 ring-1 ring-white/10",
      value: "font-display text-2xl font-bold text-white",
      label: "text-[11.5px] text-cyan-400/80 font-medium uppercase tracking-wider mt-1",
    },
    playful: {
      wrapper: "bg-paper rounded-2xl p-4 ring-2 ring-amber-200/40",
      value: "font-display text-2xl font-bold",
      label: "text-[11.5px] text-mute font-medium uppercase tracking-wider mt-1",
    },
  };

  const pointsBadgeStyles: Record<QuestionCardTheme, string> = {
    clean: "inline-flex items-center gap-2 bg-cyan-50 ring-1 ring-cyan-300/60 rounded-full px-5 py-2.5",
    brand: "inline-flex items-center gap-2 bg-cyan-500/20 ring-1 ring-cyan-400/40 rounded-full px-5 py-2.5",
    playful: "inline-flex items-center gap-2 bg-[#c46a35]/10 ring-2 ring-[#c46a35]/40 rounded-full px-5 py-2.5",
  };

  const pointsValueStyles: Record<QuestionCardTheme, string> = {
    clean: "font-display text-2xl font-bold text-navy-900",
    brand: "font-display text-2xl font-bold text-cyan-300",
    playful: "font-display text-2xl font-bold text-[#c46a35]",
  };

  const pointsLabelStyles: Record<QuestionCardTheme, string> = {
    clean: "text-[13px] text-mute",
    brand: "text-[13px] text-cyan-400/80",
    playful: "text-[13px] text-mute",
  };

  return (
    <div className={wrapperStyles[theme]}>
      {/* Trophy/header */}
      <div className="mb-5">
        <span className="text-4xl" role="img" aria-label="trophy">
          {pct >= 80 ? "🏆" : pct >= 50 ? "🎯" : "📝"}
        </span>
      </div>

      <p className={cn(titleStyles[theme], "mb-2")}>Your Score</p>
      <div className="flex items-baseline justify-center gap-1 mb-1">
        <span className={scoreStyles[theme]}>{score}</span>
        <span className={cn(maxScoreStyles[theme], "mb-1")}>/ {maxScore}</span>
      </div>
      <p className={cn(maxScoreStyles[theme], "mb-6")}>{pct}% correct</p>

      {/* Progress bar */}
      <div className={cn("h-3 rounded-full overflow-hidden mb-8", progressBg[theme])}>
        <div
          className={cn("h-full rounded-full transition-all duration-700", progressFill[theme])}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Stat breakdown */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className={statCardStyles[theme].wrapper}>
          <div
            className={cn(
              statCardStyles[theme].value,
              theme === "clean" || theme === "playful" ? "text-cyan-500" : "",
            )}
          >
            {correctCount}
          </div>
          <div className={statCardStyles[theme].label}>Correct</div>
        </div>
        <div className={statCardStyles[theme].wrapper}>
          <div
            className={cn(
              statCardStyles[theme].value,
              theme === "clean" || theme === "playful" ? "text-amber-500" : "",
            )}
          >
            {wrongCount}
          </div>
          <div className={statCardStyles[theme].label}>Wrong</div>
        </div>
        <div className={statCardStyles[theme].wrapper}>
          <div
            className={cn(
              statCardStyles[theme].value,
              theme === "clean" || theme === "playful" ? "text-mute" : "text-white/40",
            )}
          >
            {unansweredCount}
          </div>
          <div className={statCardStyles[theme].label}>Skipped</div>
        </div>
      </div>

      {/* Points credited */}
      <div className={pointsBadgeStyles[theme]}>
        <span className={pointsValueStyles[theme]}>{pointsCredited}</span>
        <span className={pointsLabelStyles[theme]}>points credited to your account</span>
      </div>
    </div>
  );
}
