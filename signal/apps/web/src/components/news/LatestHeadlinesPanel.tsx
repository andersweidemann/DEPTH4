"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Headline = {
  id: string;
  source: string;
  headline: string;
  timeLabel: string;
  thesisSlug: string | null;
  impactNote: string;
};

export function LatestHeadlinesPanel({ className }: { className?: string }) {
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<Headline[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/news/headlines?limit=8", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as { headlines?: Headline[] };
        if (!cancelled) setItems(j.headlines ?? []);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside
      className={cn(
        "rounded-lg border border-white/[0.08] bg-[#111110]/80",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Latest headlines (24h)
        </span>
        <span className="text-[10px] text-zinc-600">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <ul className="border-t border-white/[0.06] px-3 py-2">
          {items.length === 0 ? (
            <li className="py-2 text-[12px] text-zinc-600">No headlines ingested yet.</li>
          ) : (
            items.map((h) => (
              <li key={h.id} className="border-b border-white/[0.04] py-2 last:border-0">
                <p className="text-[11px] tabular-nums text-zinc-600">
                  {h.timeLabel} — <span className="font-medium text-zinc-500">[{h.source}]</span>
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-zinc-300">{h.headline}</p>
                {h.thesisSlug ? (
                  <Link
                    href={`/theses/${h.thesisSlug}`}
                    className="mt-1 inline-block text-[10px] text-[#E8473F] hover:underline"
                  >
                    View thesis →
                  </Link>
                ) : (
                  <p className="mt-1 text-[10px] text-zinc-600">{h.impactNote}</p>
                )}
              </li>
            ))
          )}
          <li className="pt-2">
            <Link href="/sources" className="text-[11px] font-medium text-[#E8473F] hover:underline">
              View all sources →
            </Link>
          </li>
        </ul>
      ) : null}
    </aside>
  );
}
