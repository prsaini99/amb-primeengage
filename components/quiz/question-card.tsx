import { cn } from "@/lib/utils";

export type QuestionCardTheme = "clean" | "brand" | "playful";

export type QuestionCardProps = {
  index: number;
  total: number;
  question: {
    id: string;
    question: string;
    options: [string, string, string, string];
  };
  selected: number | null;
  onSelect: (i: number) => void;
  theme?: QuestionCardTheme;
};

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

export function QuestionCard({
  index,
  total,
  question,
  selected,
  onSelect,
  theme = "clean",
}: QuestionCardProps) {
  const cardStyles: Record<QuestionCardTheme, string> = {
    clean: "bg-paper-2 ring-1 ring-line shadow-soft rounded-2xl p-6 md:p-8",
    brand: "bg-navy-800/60 ring-1 ring-cyan-500/20 rounded-2xl p-6 md:p-8 backdrop-blur",
    playful: "bg-paper-2 ring-2 ring-amber-300/50 rounded-3xl p-6 md:p-8 shadow-soft",
  };

  const promptStyles: Record<QuestionCardTheme, string> = {
    clean: "text-navy-900 font-semibold text-[17px] md:text-[19px] leading-snug",
    brand: "text-white font-semibold text-[17px] md:text-[19px] leading-snug",
    playful: "text-navy-900 font-semibold text-[18px] md:text-[20px] leading-snug",
  };

  const questionNumStyles: Record<QuestionCardTheme, string> = {
    clean: "text-[11.5px] font-semibold uppercase tracking-[0.18em] text-mute mb-4",
    brand: "text-[11.5px] font-semibold uppercase tracking-[0.18em] text-cyan-400 mb-4",
    playful: "text-[12px] font-bold uppercase tracking-[0.18em] text-amber-500 mb-4",
  };

  return (
    <div className={cardStyles[theme]}>
      <p className={questionNumStyles[theme]}>
        Question {index + 1} of {total}
      </p>
      <p className={cn(promptStyles[theme], "mb-6")}>{question.question}</p>
      <div className="flex flex-col gap-3">
        {question.options.map((option, i) => (
          <OptionButton
            key={i}
            label={OPTION_LABELS[i]}
            text={option}
            isSelected={selected === i}
            onSelect={() => onSelect(i)}
            theme={theme}
          />
        ))}
      </div>
    </div>
  );
}

function OptionButton({
  label,
  text,
  isSelected,
  onSelect,
  theme,
}: {
  label: string;
  text: string;
  isSelected: boolean;
  onSelect: () => void;
  theme: QuestionCardTheme;
}) {
  const baseStyles =
    "w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all cursor-pointer";

  const optionStyles: Record<QuestionCardTheme, { default: string; selected: string }> = {
    clean: {
      default:
        "bg-paper ring-1 ring-line hover:ring-navy-800/40 hover:bg-paper-2 text-ink",
      selected:
        "bg-cyan-50 ring-2 ring-cyan-500 text-navy-900",
    },
    brand: {
      default:
        "bg-navy-900/50 ring-1 ring-white/10 hover:ring-cyan-500/50 hover:bg-navy-900/70 text-white/90",
      selected:
        "bg-cyan-500/20 ring-2 ring-cyan-400 text-white",
    },
    playful: {
      default:
        "bg-paper ring-2 ring-amber-200/60 hover:ring-amber-400 hover:bg-amber-500/5 text-ink",
      selected:
        "bg-[#c46a35]/10 ring-2 ring-[#c46a35] text-navy-900",
    },
  };

  const labelStyles: Record<QuestionCardTheme, { default: string; selected: string }> = {
    clean: {
      default:
        "h-7 w-7 rounded-lg bg-paper-2 ring-1 ring-line text-[12px] font-bold text-mute grid place-items-center shrink-0",
      selected:
        "h-7 w-7 rounded-lg bg-cyan-500 text-white text-[12px] font-bold grid place-items-center shrink-0",
    },
    brand: {
      default:
        "h-7 w-7 rounded-lg bg-white/10 text-[12px] font-bold text-white/60 grid place-items-center shrink-0",
      selected:
        "h-7 w-7 rounded-lg bg-cyan-400 text-navy-900 text-[12px] font-bold grid place-items-center shrink-0",
    },
    playful: {
      default:
        "h-8 w-8 rounded-full bg-paper-2 ring-2 ring-amber-200 text-[12px] font-bold text-amber-500 grid place-items-center shrink-0",
      selected:
        "h-8 w-8 rounded-full bg-[#c46a35] text-white text-[12px] font-bold grid place-items-center shrink-0",
    },
  };

  const textSizeStyles: Record<QuestionCardTheme, string> = {
    clean: "text-[14px]",
    brand: "text-[14px]",
    playful: "text-[15px] font-medium",
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        baseStyles,
        isSelected ? optionStyles[theme].selected : optionStyles[theme].default,
      )}
    >
      <span
        className={
          isSelected ? labelStyles[theme].selected : labelStyles[theme].default
        }
      >
        {label}
      </span>
      <span className={textSizeStyles[theme]}>{text}</span>
    </button>
  );
}
