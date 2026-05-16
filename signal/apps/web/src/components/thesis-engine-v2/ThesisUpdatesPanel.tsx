"use client";

import Link from "next/link";
import useSWR from "swr";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import type { ThesisUpdatesResponse } from "@/types/thesis";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ThesisUpdatesPanel({ slug }: { slug: string }) {
  const key = slug ? `/api/theses/${encodeURIComponent(slug)}/updates` : null;
  const { data, error, isLoading } = useSWR<ThesisUpdatesResponse>(key, swrJsonFetcher);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-white/[0.06] bg-zinc-900/20 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Mutation history</p>
        <p className="mt-2 text-[12px] text-zinc-500">Loading…</p>
      </section>
    );
  }

  if (error) return null;

  const items = data?.items ?? [];
  if (!items.length && !data?.supersedesSlug) return null;

  return (
    <section className="rounded-lg border border-white/[0.06] bg-zinc-900/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Mutation history</p>
        {data?.supersedesSlug ? (
          <p className="text-[10px] text-zinc-500">
            Supersedes{" "}
            <Link href={`/theses/${data.supersedesSlug}`} className="text-amber-200/90 underline underline-offset-2">
              prior thesis
            </Link>
          </p>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-[12px] text-zinc-600">No audited mutations yet for this thesis.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((u) => (
            <li key={u.id} className="border-b border-white/[0.05] pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {u.changeType}
                  {u.actorType ? ` · ${u.actorType}` : ""}
                </span>
                <span className="text-[10px] tabular-nums text-zinc-600">{formatWhen(u.createdAt)}</span>
              </div>
              {u.reason?.trim() ? (
                <p className="mt-1.5 text-[12px] leading-snug text-zinc-200">{u.reason}</p>
              ) : null}
              {u.metadata?.successorThesisId ? (
                <p className="mt-1 text-[11px] text-zinc-500">
                  Successor id: <span className="font-mono text-zinc-400">{String(u.metadata.successorThesisId)}</span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
