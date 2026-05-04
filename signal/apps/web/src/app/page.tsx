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
        <p className="text-xs font-mono text-emerald-500/80 uppercase tracking-[0.25em] mb-4">Live wires · your book</p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-50">
          A desk in your browser
        </h1>
        <p className="text-lg text-zinc-400 mt-4 max-w-2xl leading-relaxed">
          See the headline, the story, what could happen next, and when it matters for{" "}
          <span className="text-rose-400/90">holdings</span> and{" "}
          <span className="text-amber-400/90">open orders</span> — not a generic news feed.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
          <Link
            href="/signup?next=/onboarding"
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full sm:w-auto sm:min-w-[200px] justify-center bg-emerald-600 text-zinc-950 font-semibold hover:bg-emerald-500",
            )}
          >
            Get started
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
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left w-full max-w-3xl text-sm">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="font-mono text-xs text-zinc-500">L1–L2</p>
            <p className="text-zinc-200 mt-1">Hook + causal chain for every event, free.</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-4">
            <p className="font-mono text-xs text-emerald-500/80">Pro</p>
            <p className="text-zinc-200 mt-1">Scenarios, book &amp; order depth, briefings, more alerts.</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="font-mono text-xs text-zinc-500">Alerts</p>
            <p className="text-zinc-200 mt-1">Opt in to desktop nudges on high-signal events.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
