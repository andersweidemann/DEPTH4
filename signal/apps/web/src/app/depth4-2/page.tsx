"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Hidden launcher — entry point for DEPTH4 2.0 prototype. */
export default function Depth42LauncherPage() {
  const [stay, setStay] = useState(false);

  useEffect(() => {
    if (stay) return;
    const t = window.setTimeout(() => {
      window.location.assign("/theses");
    }, 900);
    return () => window.clearTimeout(t);
  }, [stay]);

  return (
    <div className="min-h-dvh bg-[#0c0c0e] text-zinc-100">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">DEPTH4</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">2.0 Prototype Launcher</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Thesis-first macro advisor. This page auto-opens <span className="text-amber-200/85">/theses</span> in a moment.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link
            href="/theses"
            className="rounded-md bg-amber-500/15 px-3 py-2 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-500/25 hover:bg-amber-500/20"
          >
            Open Theses
          </Link>
          <Link
            href="/feed-2"
            className="rounded-md bg-zinc-900/40 px-3 py-2 text-[11px] font-semibold text-zinc-200 ring-1 ring-white/[0.08] hover:bg-zinc-900/60"
          >
            Feed
          </Link>
          <Link
            href="/book-2"
            className="rounded-md bg-zinc-900/40 px-3 py-2 text-[11px] font-semibold text-zinc-200 ring-1 ring-white/[0.08] hover:bg-zinc-900/60"
          >
            Book
          </Link>
          <Link
            href="/community"
            className="rounded-md bg-zinc-900/40 px-3 py-2 text-[11px] font-semibold text-zinc-200 ring-1 ring-white/[0.08] hover:bg-zinc-900/60"
          >
            Community
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-md bg-zinc-900/40 px-3 py-2 text-[11px] font-semibold text-zinc-200 ring-1 ring-white/[0.08] hover:bg-zinc-900/60"
          >
            Leaderboard
          </Link>
        </div>

        <div className="mt-8 rounded-lg border border-white/[0.06] bg-zinc-900/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-zinc-400">
              Auto-redirect: <span className="text-zinc-200">{stay ? "paused" : "in 0.9s"}</span>
            </p>
            <button
              type="button"
              className="rounded-md px-3 py-2 text-[11px] font-semibold text-zinc-300 ring-1 ring-white/[0.08] hover:bg-zinc-900/60"
              onClick={() => setStay((s) => !s)}
            >
              {stay ? "Resume redirect" : "Stay here"}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            Tip: use this launcher as a stable entry while the 2.0 routes evolve.
          </p>
        </div>
      </div>
    </div>
  );
}
