import { cn } from "@/lib/utils";
import type { QuestionCardTheme } from "./question-card";

export type QuizTimerProps = {
  remainingSeconds: number;
  theme?: QuestionCardTheme;
};

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function QuizTimer({ remainingSeconds, theme = "clean" }: QuizTimerProps) {
  const isUrgent = remainingSeconds <= 30;

  const wrapperStyles: Record<QuestionCardTheme, string> = {
    clean: cn(
      "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 ring-1 text-[13px] font-mono font-semibold",
      isUrgent
        ? "bg-amber-500/10 ring-amber-500/40 text-amber-500"
        : "bg-paper-2 ring-line text-navy-800",
    ),
    brand: cn(
      "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 ring-1 text-[13px] font-mono font-semibold",
      isUrgent
        ? "bg-amber-500/20 ring-amber-400/60 text-amber-300"
        : "bg-white/10 ring-white/20 text-cyan-300",
    ),
    playful: cn(
      "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-mono font-bold",
      isUrgent
        ? "bg-[#c46a35] text-white"
        : "bg-amber-400/20 text-amber-500 ring-2 ring-amber-300/60",
    ),
  };

  const dotStyles: Record<QuestionCardTheme, string> = {
    clean: cn("h-2 w-2 rounded-full", isUrgent ? "bg-amber-500 pulse-dot" : "bg-cyan-500"),
    brand: cn("h-2 w-2 rounded-full", isUrgent ? "bg-amber-400 pulse-dot" : "bg-cyan-400"),
    playful: cn("h-2 w-2 rounded-full", isUrgent ? "bg-white pulse-dot" : "bg-amber-500"),
  };

  return (
    <div className={wrapperStyles[theme]} role="timer" aria-label={`Time remaining: ${fmtTime(remainingSeconds)}`}>
      <span className={dotStyles[theme]} aria-hidden />
      <span>{fmtTime(remainingSeconds)}</span>
    </div>
  );
}
