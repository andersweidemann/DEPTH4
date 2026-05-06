"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

const KEY = "depth4.v2.ready.seen.v1";

function loadSeen(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function saveSeen(next: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** One-time-style alert when a thesis becomes Ready with a strong probability (dummy threshold). */
export function ReadyPing({ theses }: { theses: Thesis[] }) {
  const readyNow = useMemo(
    () => theses.filter((t) => t.status === "ready" && t.probability >= 55),
    [theses],
  );
  const [seen, setSeen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSeen(loadSeen());
  }, []);

  const firstUnseen = readyNow.find((t) => !seen[t.id]);
  if (!firstUnseen) return null;

  return (
    <div className="mt-6 rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-[12px] text-zinc-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/90">
            Entry setup valid
          </span>
          <p className="mt-1 truncate">
            <span className="text-zinc-400">Ping · </span>
            <Link
              className="text-amber-200 underline underline-offset-2 hover:text-amber-100"
              href={`/theses/${firstUnseen.slug}`}
            >
              {firstUnseen.title}
            </Link>{" "}
            is now <span className="font-medium text-zinc-200">Ready</span>.
          </p>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-md bg-zinc-950/30 px-3 py-2 text-[11px] font-semibold text-zinc-300 ring-1 ring-white/[0.06] hover:bg-zinc-900/40"
          onClick={() => {
            const next = { ...seen, [firstUnseen.id]: true };
            setSeen(next);
            saveSeen(next);
          }}
        >
          Dismiss
        </button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        Probability crossed threshold{firstUnseen.entryZone ? ` · entry zone ${firstUnseen.entryZone}` : ""}.
      </p>
    </div>
  );
}
