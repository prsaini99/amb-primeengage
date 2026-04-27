import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto max-w-[1320px] px-4 sm:px-5 md:px-8", className)}>{children}</div>;
}

export function Section({
  id, className, children, tint = "paper",
}: { id?: string; className?: string; children: ReactNode; tint?: "paper" | "white" | "navy" }) {
  const bg = {
    paper: "bg-paper text-ink",
    white: "bg-paper-2 text-ink",
    navy:  "bg-navy-900 text-white",
  }[tint];
  return (
    <section id={id} className={cn("relative", bg, className)}>
      <Container className="py-14 sm:py-20 md:py-28">{children}</Container>
    </section>
  );
}

export function Pill({ children, tint = "cyan" }: { children: ReactNode; tint?: "cyan" | "amber" | "navy" | "white" }) {
  const styles = {
    cyan:  "bg-cyan-50 text-navy-800 ring-1 ring-cyan-300/60",
    amber: "bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/30",
    navy:  "bg-navy-800 text-cyan-300",
    white: "bg-white/10 text-white ring-1 ring-white/20",
  }[tint];
  return (
    <span className={cn("inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-medium tracking-wide", styles)}>
      {children}
    </span>
  );
}

type BtnProps = { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "link"; className?: string; newTab?: boolean };
export function Button({ href, children, variant = "primary", className, newTab }: BtnProps) {
  const base = "inline-flex items-center justify-center gap-2 h-12 px-6 text-[14px] font-semibold rounded-full transition-all group whitespace-nowrap";
  const styles = {
    primary:   "bg-amber-500 hover:bg-amber-400 text-white shadow-soft hover:-translate-y-0.5",
    secondary: "bg-navy-900 hover:bg-navy-800 text-white shadow-soft",
    ghost:     "bg-paper-2 text-navy-800 ring-1 ring-line-strong hover:ring-navy-800 hover:bg-white",
    link:      "h-auto px-0 text-navy-800 hover:text-amber-500",
  }[variant];
  return (
    <Link href={href} target={newTab ? "_blank" : undefined} className={cn(base, styles, className)}>
      <span>{children}</span>
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

export function Stat({ value, label, tint = "ink" }: { value: string; label: string; tint?: "ink" | "white" }) {
  return (
    <div className="flex flex-col">
      <span className={cn("font-display text-5xl md:text-6xl font-semibold", tint === "white" ? "text-white" : "text-navy-900")}>
        {value}
      </span>
      <span className={cn("mt-2 text-[14px]", tint === "white" ? "text-white/70" : "text-mute")}>{label}</span>
    </div>
  );
}

export function FeatureCard({ icon, title, body, href }: { icon?: ReactNode; title: string; body: string; href?: string }) {
  const inner = (
    <div className="group h-full rounded-3xl bg-paper-2 ring-1 ring-line p-7 md:p-8 hover:ring-navy-800/30 hover:-translate-y-0.5 transition-all shadow-soft">
      {icon && (
        <div className="h-12 w-12 rounded-2xl brand-gradient text-white grid place-items-center mb-6 shadow-brand">
          {icon}
        </div>
      )}
      <h3 className="font-display text-[22px] leading-tight text-navy-900 mb-3 font-semibold">{title}</h3>
      <p className="text-[14.5px] leading-relaxed text-mute">{body}</p>
      {href && (
        <span className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-navy-800 group-hover:text-amber-500 transition-colors">
          Read more <span aria-hidden>→</span>
        </span>
      )}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function SectionHeader({
  eyebrow, title, body, align = "left",
}: { eyebrow: string; title: ReactNode; body?: string; align?: "left" | "center" }) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      <Pill>{eyebrow}</Pill>
      <h2 className="font-display text-4xl md:text-5xl font-semibold text-navy-900 mt-5 leading-[1.05]">
        {title}
      </h2>
      {body && <p className="mt-5 text-[16px] leading-relaxed text-mute">{body}</p>}
    </div>
  );
}
