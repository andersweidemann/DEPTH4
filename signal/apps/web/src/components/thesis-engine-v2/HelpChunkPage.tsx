"use client";

import useSWR from "swr";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import type { HelpResponse } from "@/types/help";

export function HelpChunkPage() {
  const { data, error, isLoading, mutate } = useSWR<HelpResponse>("/api/help", swrJsonFetcher);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 py-6">
        <div className="h-4 w-1/3 rounded bg-zinc-800" />
        <div className="h-3 w-1/2 rounded bg-zinc-800" />
        <div className="h-3 w-2/3 rounded bg-zinc-800" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-20 text-center">
        <p className="text-[14px] text-red-400">
          {error instanceof Error ? error.message : "Failed to load help"}
        </p>
        <button
          type="button"
          onClick={() => void mutate()}
          className="mt-2 text-[12px] text-amber-400 hover:text-amber-300"
        >
          Retry
        </button>
      </div>
    );
  }

  const sections = data.sections || [];
  const lastUpdated = data.lastUpdated || "";

  return (
    <div className="flex gap-8 pb-16">
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-20">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">On this page</p>
          <nav className="space-y-1">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block py-0.5 text-[12px] text-zinc-400 transition-colors hover:text-zinc-200"
              >
                {section.title}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Help center</h1>
        <p className="mt-1 text-[13px] text-zinc-400">How to use DEPTH4.</p>

        <nav className="mt-6 flex flex-nowrap gap-2 overflow-x-auto pb-2 lg:hidden" aria-label="On this page">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="shrink-0 rounded-md border border-white/[0.08] bg-zinc-900/30 px-3 py-1.5 text-[11px] text-zinc-300"
            >
              {section.title}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-10">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-100">{section.title}</h2>
              <div className="mt-3 space-y-3">
                {section.content.map((paragraph, i) => (
                  <p key={i} className="text-[13px] leading-relaxed text-zinc-400">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 text-[11px] text-zinc-600">Last updated: {lastUpdated}</p>
      </div>
    </div>
  );
}
