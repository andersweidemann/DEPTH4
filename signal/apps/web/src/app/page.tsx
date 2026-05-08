import Link from "next/link";
import type { Metadata } from "next";
import { Depth4Wordmark } from "@/components/brand/Depth4Wordmark";

export const metadata: Metadata = {
  title: "DEPTH4 — Your macro thesis engine",
  description: "Track unpriced macro narratives, update probability in real time, and act before the market catches up.",
};

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-[#0c0c0e] text-zinc-100 antialiased">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-3">
            <Depth4Wordmark size="sm" />
            <span className="hidden text-[10px] font-medium uppercase tracking-[2.5px] text-zinc-600 lg:inline">
              Your macro thesis engine
            </span>
          </div>
          <nav className="flex items-center gap-2 text-[12px]">
            <Link href="/demo" className="px-2 py-1 text-zinc-400 hover:text-zinc-200">
              View live demo
            </Link>
            <Link href="/pricing" className="px-2 py-1 text-zinc-400 hover:text-zinc-200">
              Pricing
            </Link>
            <Link href="/login" className="px-2 py-1 text-zinc-400 hover:text-zinc-200">
              Sign in
            </Link>
            <Link href="/signup?next=/theses" className="rounded-md bg-amber-500 px-3 py-1.5 text-[12px] font-semibold text-zinc-950 hover:bg-amber-400">
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16 pt-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          <section className="lg:col-span-6">
            <Depth4Wordmark size="lg" align="left" className="text-zinc-100" />
            <p className="mt-3 text-[10px] font-medium uppercase tracking-[2.5px] text-zinc-600">Your macro thesis engine</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-50 md:text-5xl">
              Track narratives the market hasn’t priced in.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-300">
              Build macro theses, map scenarios, and monitor probability shifts. Insider Flow flags unusual tape before a headline confirms it.
            </p>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Link href="/signup?next=/theses" className="rounded-md bg-amber-500 px-4 py-2.5 text-[13px] font-semibold text-zinc-950 hover:bg-amber-400">
                Create account
              </Link>
              <Link href="/login?next=/theses" className="rounded-md border border-white/[0.10] bg-transparent px-4 py-2.5 text-[13px] font-semibold text-zinc-100 hover:bg-white/[0.05]">
                Sign in
              </Link>
              <Link href="/demo" className="text-[13px] font-semibold text-zinc-400 hover:text-white">
                Try the demo →
              </Link>
            </div>
            <p className="mt-6 text-[11px] leading-relaxed text-zinc-500">
              Informational only. Not investment advice. Performance examples are illustrative.
            </p>
          </section>

          <aside className="lg:col-span-6">
            <div className="bg-zinc-950/35 p-4 ring-1 ring-white/[0.08]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">What you do in DEPTH4</p>
              <div className="mt-4 grid gap-2">
                {[
                  ["Write a thesis", "Title, asset, direction, why now, unpriced, entry/stop/target."],
                  ["Define scenarios", "Base/Bull/Bear probabilities + confirms + consequence."],
                  ["Star to subscribe", "Get probability-change alerts only for starred theses."],
                  ["Monitor Insider Flow", "Unusual price/volume aligned to your mapped instruments."],
                ].map(([k, v]) => (
                  <div key={k} className="bg-zinc-900/20 px-4 py-3">
                    <p className="text-[12px] font-semibold text-zinc-100">{k}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link href="/help" className="text-[12px] font-semibold text-zinc-300 hover:text-white">
                  Getting started →
                </Link>
                <span className="text-zinc-700">·</span>
                <Link href="/theses" className="text-[12px] font-semibold text-zinc-300 hover:text-white">
                  View theses (sign-in) →
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

