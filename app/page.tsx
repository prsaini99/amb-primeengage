import Link from "next/link";
import { Logo } from "@/components/logo";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-paper text-ink flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-[1320px] px-4 sm:px-5 md:px-8 h-16 flex items-center">
          <Logo size={36} />
        </div>
      </header>

      <section className="flex-1 grid place-items-center">
        <div className="mx-auto max-w-[640px] px-6 text-center">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-medium tracking-wide bg-cyan-50 text-navy-800 ring-1 ring-cyan-300/60">
            Yuvaah Platform
          </span>
          <h1 className="font-display text-4xl md:text-5xl font-semibold text-navy-900 mt-5 leading-[1.05]">
            <span className="text-brand-gradient">Operational dashboard</span>
            <br /> for the Yuvaah Club
          </h1>
          <p className="mt-5 text-[16px] leading-relaxed text-mute">
            Public applications happen on the marketing site. This is where the
            team reviews, approves, and runs the program.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 h-12 px-6 text-[14px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft hover:-translate-y-0.5 transition-all"
            >
              <span>Sign in</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
