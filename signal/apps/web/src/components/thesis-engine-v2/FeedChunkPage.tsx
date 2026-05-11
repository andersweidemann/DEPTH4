"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton } from "@/components/shared/Skeleton";
import type { FeedResponse, NewsEvent } from "@/types/feed";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function FeedRowLinkIcon({
  href,
  disabled,
}: {
  href: string;
  disabled?: boolean;
}) {
  const icon = (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
  if (disabled) {
    return <span className="inline-flex text-zinc-700">{icon}</span>;
  }
  return (
    <Link
      href={href}
      className="text-zinc-600 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
      aria-label="Open reasoning"
    >
      {icon}
    </Link>
  );
}

function MobileFeedRow({ event }: { event: NewsEvent }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-relaxed text-zinc-300">{event.headline}</p>
        {event.linkedThesisSlug ? (
          <Link
            href={`/theses/${event.linkedThesisSlug}`}
            className="mt-0.5 inline-block text-[10px] text-amber-400 transition-colors hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
            {event.linkedThesisTitle || event.linkedThesisSlug}
          </Link>
        ) : (
          <span className="mt-0.5 inline-block text-[10px] text-zinc-600">No linked thesis yet</span>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="text-[11px] text-zinc-500">{event.timestamp}</span>
        <FeedRowLinkIcon href={`/feed/events/${event.id}`} disabled={!UUID_RE.test(event.id)} />
      </div>
    </div>
  );
}

export function FeedChunkPage() {
  const feedKey = useMemo(() => "/api/feed", []);
  const { data, error, isLoading, mutate } = useSWR<FeedResponse>(feedKey, swrJsonFetcher);
  useSWR<{ items: NewsEvent[] }>("/api/feed/reasoning", swrJsonFetcher, { revalidateOnFocus: false });

  useEffect(() => {
    document.title = "DEPTH4 · Feed";
  }, []);

  const events = data?.events ?? [];
  const promoted = data?.promotedReasoning ?? [];
  const context = data?.context ?? null;

  if (isLoading) {
    return (
      <div className="pb-16">
        <PageHeaderSkeleton />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
        <div className="mt-8 space-y-0 divide-y divide-white/[0.06]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="grid grid-cols-[120px_1fr_100px_40px] gap-3 py-4 max-sm:hidden">
              <Skeleton className="h-3 w-16" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
              <Skeleton className="h-3 w-14 justify-self-end" />
              <Skeleton className="h-4 w-4 justify-self-end" />
            </div>
          ))}
          {[0, 1, 2].map((i) => (
            <div key={`m-${i}`} className="flex gap-3 py-4 sm:hidden">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2.5 w-2/3" />
              </div>
              <div className="flex w-20 flex-col items-end gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <ErrorBanner message={friendlyApiMessage(error)} onRetry={() => void mutate()} />
    );
  }

  return (
    <div className="pb-16">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Feed</h1>
      <p className="mt-1 text-[13px] text-zinc-400">Latest macro headlines and event reasoning.</p>

      {promoted.length > 0 && (
        <div className="mt-6 space-y-3">
          {promoted.map((item) => (
            <div key={item.id} className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                <span className="font-medium text-zinc-400">Promoted reasoning</span>
                <span>·</span>
                <span>{item.source}</span>
                <span>·</span>
                <span>Signal level {item.signalLevel ?? 0}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">{item.reasoning}</p>
              {item.linkedThesisSlug ? (
                <Link
                  href={`/theses/${item.linkedThesisSlug}`}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-400 transition-colors hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
                >
                  {item.linkedThesisTitle || "Linked thesis"} →
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        {events.length === 0 ? (
          <p className="mt-4 text-[12px] text-zinc-600">No headlines yet.</p>
        ) : (
          <>
            <div className="divide-y divide-white/[0.06] sm:hidden">
              {events.map((event) => (
                <MobileFeedRow key={event.id} event={event} />
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <div className="grid min-w-[520px] grid-cols-[120px_1fr_100px_40px] gap-3 border-b border-white/[0.06] pb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                <span>Source</span>
                <span>Headline</span>
                <span className="text-right">Time</span>
                <span />
              </div>
              <div className="min-w-[520px] divide-y divide-white/[0.06]">
                {events.map((event) => (
                  <div key={event.id} className="grid grid-cols-[120px_1fr_100px_40px] items-start gap-3 py-3">
                    <span className="truncate text-[11px] text-zinc-500">{event.source}</span>
                    <div className="min-w-0">
                      <p className="text-[12px] leading-relaxed text-zinc-300">{event.headline}</p>
                      {event.linkedThesisSlug ? (
                        <Link
                          href={`/theses/${event.linkedThesisSlug}`}
                          className="mt-0.5 inline-block text-[10px] text-amber-400 transition-colors hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
                        >
                          {event.linkedThesisTitle || event.linkedThesisSlug}
                        </Link>
                      ) : (
                        <span className="mt-0.5 inline-block text-[10px] text-zinc-600">No linked thesis yet</span>
                      )}
                    </div>
                    <span className="text-right text-[11px] text-zinc-500">{event.timestamp}</span>
                    <div className="flex justify-end">
                      <FeedRowLinkIcon href={`/feed/events/${event.id}`} disabled={!UUID_RE.test(event.id)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {context && (
        <div className="mt-10 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{context.title}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">{context.description}</p>
          <p className="mt-2 text-[11px] text-zinc-600">{context.note}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {context.sources.map((s) => (
              <span
                key={s}
                className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-500"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
