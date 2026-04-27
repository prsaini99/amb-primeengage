import { cn } from "@/lib/utils";

export function PageHeading({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-navy-900">{title}</h1>
        {subtitle && <p className="text-[14px] text-mute mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, delta, tint = "cyan" }: { label: string; value: string; delta?: string; tint?: "cyan" | "amber" | "navy" }) {
  const bar = { cyan: "bg-cyan-500", amber: "bg-amber-500", navy: "bg-navy-800" }[tint];
  return (
    <div className="relative rounded-2xl bg-paper-2 ring-1 ring-line p-5 overflow-hidden">
      <div className={cn("absolute left-0 top-5 bottom-5 w-1 rounded-r-full", bar)} />
      <div className="pl-3">
        <div className="text-[11px] uppercase tracking-[0.2em] text-mute font-semibold">{label}</div>
        <div className="font-display text-3xl font-bold text-navy-900 mt-2">{value}</div>
        {delta && <div className="text-[11.5px] text-mute mt-1">{delta}</div>}
      </div>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warn" | "danger" | "info" }) {
  const styles = {
    neutral: "bg-paper text-ink ring-line-strong",
    success: "bg-cyan-50 text-navy-800 ring-cyan-300/60",
    warn:    "bg-amber-500/10 text-amber-500 ring-amber-500/30",
    danger:  "bg-red-50 text-red-700 ring-red-200",
    info:    "bg-navy-800/10 text-navy-800 ring-navy-800/20",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold ring-1", styles)}>{children}</span>;
}

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-paper-2 ring-1 ring-line overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">{children}</table>
      </div>
    </div>
  );
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("text-left font-semibold text-[11.5px] uppercase tracking-[0.14em] text-mute px-4 py-3 border-b border-line bg-paper", className)}>{children}</th>;
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 border-b border-line text-navy-900 align-top", className)}>{children}</td>;
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {children}
    </div>
  );
}

export function FilterChip({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button className={cn(
      "px-3.5 h-8 rounded-full text-[12.5px] font-medium ring-1 transition-colors",
      active ? "bg-navy-900 text-white ring-navy-900" : "bg-paper-2 text-mute ring-line-strong hover:text-navy-900"
    )}>
      {children}
    </button>
  );
}

export function SearchInput({ placeholder }: { placeholder: string }) {
  return (
    <input
      placeholder={placeholder}
      // Browser extensions (Temp Mail, password managers, Grammarly, etc.)
      // mutate inputs before hydration, causing benign attribute mismatches.
      // suppressHydrationWarning silences the dev-only console error without
      // affecting behavior. NOTE: this diverges from primeengage's verbatim
      // copy — backport there if the same warning shows up on their forms.
      suppressHydrationWarning
      className="h-9 flex-1 min-w-[240px] max-w-sm rounded-full bg-paper-2 ring-1 ring-line-strong px-4 text-[13px] focus:outline-none focus:ring-cyan-500"
    />
  );
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function inr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
