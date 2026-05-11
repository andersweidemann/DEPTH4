"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { CardSkeleton, PageHeaderSkeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";
import type { HelpResponse } from "@/types/help";

export function HelpChunkPage() {
  useEffect(() => {
    document.title = "DEPTH4 · Help";
  }, []);

  const { data, error, isLoading, mutate } = useSWR<HelpResponse>("/api/help", swrJsonFetcher);

  if (isLoading) {
    return (
      <div className="flex gap-8 pb-16">
        <div className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20 space-y-2">
            <div className="h-2.5 w-20 rounded bg-zinc-800" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3 w-full rounded bg-zinc-800" />
            ))}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <PageHeaderSkeleton />
          <div className="mt-8 space-y-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <ErrorBanner message={friendlyApiMessage(error)} onRetry={() => void mutate()} />;
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
                className="block py-0.5 text-[12px] text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
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

        <nav
          className="no-print mt-6 flex flex-nowrap gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
          aria-label="On this page"
        >
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={cn(
                "shrink-0 rounded-md border border-white/[0.08] bg-zinc-900/30 px-3 py-1.5 text-[11px] text-zinc-300 transition-colors hover:border-white/[0.12] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
              )}
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
