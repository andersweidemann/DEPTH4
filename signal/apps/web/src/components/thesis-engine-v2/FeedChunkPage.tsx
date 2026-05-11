"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FeedContext, NewsEvent } from "@/types/feed";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function FeedChunkPage() {
  const [events, setEvents] = useState<NewsEvent[]>([]);
  const [promoted, setPromoted] = useState<NewsEvent[]>([]);
  const [context, setContext] = useState<FeedContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/feed")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load feed"))))
      .then((data: { events?: NewsEvent[]; promotedReasoning?: NewsEvent[]; context?: FeedContext }) => {
        setEvents(data.events || []);
        setPromoted(data.promotedReasoning || []);
        setContext(data.context || null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load feed");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto h-4 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="mx-auto mt-2 h-3 w-48 animate-pulse rounded bg-zinc-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-[14px] text-red-400">
          {error}{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-amber-400 hover:text-amber-300"
          >
            Retry
          </button>
        </p>
      </div>
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
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300"
                >
                  {item.linkedThesisTitle || "Linked thesis"} →
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 overflow-x-auto">
        <div className="grid min-w-[520px] grid-cols-[120px_1fr_100px_40px] gap-3 border-b border-white/[0.06] pb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
          <span>Source</span>
          <span>Headline</span>
          <span className="text-right">Time</span>
          <span />
        </div>

        {events.length === 0 ? (
          <p className="mt-4 text-[12px] text-zinc-600">No headlines yet.</p>
        ) : (
          <div className="min-w-[520px] divide-y divide-white/[0.06]">
            {events.map((event) => (
              <div
                key={event.id}
                className="grid grid-cols-[120px_1fr_100px_40px] items-start gap-3 py-3"
              >
                <span className="truncate text-[11px] text-zinc-500">{event.source}</span>
                <div className="min-w-0">
                  <p className="text-[12px] leading-relaxed text-zinc-300">{event.headline}</p>
                  {event.linkedThesisSlug ? (
                    <Link
                      href={`/theses/${event.linkedThesisSlug}`}
                      className="mt-0.5 inline-block text-[10px] text-amber-400 hover:text-amber-300"
                    >
                      {event.linkedThesisTitle || event.linkedThesisSlug}
                    </Link>
                  ) : (
                    <span className="mt-0.5 inline-block text-[10px] text-zinc-600">No linked thesis yet</span>
                  )}
                </div>
                <span className="text-right text-[11px] text-zinc-500">{event.timestamp}</span>
                <div className="flex justify-end">
                  {UUID_RE.test(event.id) ? (
                    <Link
                      href={`/feed/events/${event.id}`}
                      className="text-zinc-600 transition-colors hover:text-zinc-300"
                      aria-label="Open reasoning"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                        />
                      </svg>
                    </Link>
                  ) : (
                    <span className="inline-flex text-zinc-700" aria-hidden>
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                        />
                      </svg>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
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
