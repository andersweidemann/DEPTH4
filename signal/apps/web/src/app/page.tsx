import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="min-h-dvh flex flex-col grid-bg">
      <header className="shrink-0 border-b border-zinc-800/80 px-4 md:px-8 h-14 flex items-center justify-between max-w-6xl mx-auto w-full">
        <span className="font-semibold tracking-tight text-emerald-400">DEPTH4</span>
        <nav className="flex items-center flex-wrap justify-end gap-2 sm:gap-3 text-sm">
          <Link href="/demo" className="text-zinc-400 hover:text-zinc-200">
            Live demo
          </Link>
          <a
            href="/depth4-prototype.html"
            className="text-zinc-500 hover:text-zinc-200 text-sm"
            target="_blank"
            rel="noreferrer"
          >
            UI prototype
          </a>
          <Link href="/pricing" className="text-zinc-400 hover:text-zinc-200">
            Plans
          </Link>
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-zinc-300 hover:text-white hover:bg-zinc-800",
            )}
          >
            Sign in
          </Link>
          <Link
            href="/signup?next=/onboarding"
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-zinc-800 text-zinc-200 border border-zinc-600 hover:bg-zinc-700",
            )}
          >
            Create account
          </Link>
        </nav>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center max-w-4xl mx-auto">
        <p className="text-xs font-mono text-emerald-500/80 uppercase tracking-[0.25em] mb-4">
          Not just a news aggregator: a forward-looking impact propagation model
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-50">
          See What the Market Hasn&apos;t Priced In Yet
        </h1>
        <p className="text-lg text-zinc-400 mt-4 max-w-2xl leading-relaxed">
          Most traders react to news. DEPTH4 shows you what comes next — across four levels of market impact, before the
          crowd gets there.
        </p>
        <p className="text-base text-zinc-400/90 mt-4 max-w-2xl leading-relaxed">
          Every macro event ripples outward. DEPTH4 maps those ripples — from the obvious first movers to the hidden
          structural shifts that take weeks to price in.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
          <Link
            href="/signup?next=/onboarding"
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full sm:w-auto sm:min-w-[200px] justify-center bg-emerald-600 text-zinc-950 font-semibold hover:bg-emerald-500",
            )}
          >
            Start Trading Smarter
          </Link>
          <Link
            href="/demo"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "w-full sm:w-auto sm:min-w-[200px] justify-center border-zinc-600 text-zinc-200 hover:bg-zinc-800",
            )}
          >
            Try the demo
          </Link>
        </div>
        <div className="mt-16 w-full max-w-3xl text-left">
          <p className="text-xs font-mono text-zinc-500 uppercase tracking-[0.22em]">How DEPTH4 Works</p>
          <p className="text-sm text-zinc-300 mt-2">
            Markets price obvious information in minutes. The edge lives in what they miss.
          </p>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="font-mono text-xs text-zinc-500">Level 1 — Direct Impact</p>
              <p className="text-zinc-200 mt-1">
                The stocks and assets everyone trades the moment news breaks. Priced within hours. DEPTH4 shows you when
                to skip the crowd.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="font-mono text-xs text-zinc-500">Level 2 — Sector Ripple</p>
              <p className="text-zinc-200 mt-1">
                The industries that depend on, supply, or compete with Level 1. Partially priced within a day. Still room
                to move.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="font-mono text-xs text-zinc-500">Level 3 — Macro Cascade</p>
              <p className="text-zinc-200 mt-1">
                Capital flows, currencies, and commodities that shift as Level 2 reprices. Most traders never connect
                these dots. You will.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-4">
              <p className="font-mono text-xs text-emerald-500/80">Level 4 — Structural Drift</p>
              <p className="text-zinc-200 mt-1">
                Long-term behavioral and policy changes set in motion by the original event. Weeks out. Less than 10%
                priced at the time of the news. This is where the real edge lives.
              </p>
            </div>
          </div>

          <div className="mt-10 rounded-xl border border-zinc-800 bg-zinc-950/40 p-5">
            <p className="text-zinc-50 font-semibold">The delta is your opportunity.</p>
            <p className="text-zinc-300 mt-2 text-sm leading-relaxed">
              DEPTH4 measures the gap between what a macro event implies for a stock and what the market has already done
              to its price. The bigger the gap, the bigger the unpriced opportunity — and the deeper the level, the
              longer your window to act.
            </p>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div>
              <p className="text-zinc-50 font-semibold">Stop reacting. Start anticipating.</p>
              <p className="text-zinc-300 text-sm mt-1">Join traders who see four moves ahead.</p>
            </div>
            <Link
              href="/signup?next=/onboarding"
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full sm:w-auto justify-center bg-emerald-600 text-zinc-950 font-semibold hover:bg-emerald-500",
              )}
            >
              Get Early Access
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
