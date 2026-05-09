"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";
import { normalizeThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";
import { resolveThesisDetailSlug } from "@/lib/thesis-engine-v2/user-theses";
import Link from "next/link";

export function ThesisAlertsBell() {
  const { alerts, unreadAlertCount, dismissAlert, markAllRead, markReadOnOpen } = useThesisLive();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<"all" | "probability" | "trade" | "system">("all");
  const [testRowId, setTestRowId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return alerts;
    if (filter === "probability") return alerts.filter((a) => a.type === "probability_change");
    if (filter === "trade") return alerts.filter((a) => a.type === "consequence_change" || a.type === "invalidation");
    return alerts.filter((a) => a.type === "system");
  }, [alerts, filter]);

  useEffect(() => {
    if (!open) return;
    markReadOnOpen();
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, markReadOnOpen]);

  useEffect(() => {
    if (!open) return;
    setTestRowId((prev) => prev ?? alerts[0]?.id ?? null);
  }, [open, alerts]);

  useEffect(() => {
    if (open) return;
    setTestRowId(null);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid="thesis-alerts-bell"
        className="relative flex h-10 w-10 items-center justify-center rounded-md text-zinc-400 ring-1 ring-white/[0.08] hover:bg-zinc-900/50 hover:text-zinc-200"
        aria-label="Thesis alerts"
        title="Starred & open-position theses"
        onClick={() => setOpen((o) => !o)}
      >
        <Bell className="h-4 w-4" />
        {unreadAlertCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500/90 px-0.5 text-[9px] font-bold text-zinc-950">
            {unreadAlertCount > 9 ? "9+" : unreadAlertCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={cn(
            "absolute right-0 top-full z-[120] mt-2 w-[min(calc(100vw-2rem),22rem)] rounded-none bg-[#141416]",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Alerts</p>
            {alerts.length > 0 ? (
              <button
                type="button"
                className="shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-900/60 hover:text-zinc-100"
                onClick={() => markAllRead()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-1 border-b border-white/[0.06] px-2 py-2">
            {(
              [
                ["all", "All"],
                ["probability", "Probability"],
                ["trade", "Trade"],
                ["system", "System"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                  filter === k ? "bg-zinc-900/60 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-[12px] text-zinc-500">
                <p className="text-zinc-400">No alerts yet.</p>
                <p className="mt-1">
                  Star a thesis for probability updates. Insider Flow events (tape + tags) also land here under{" "}
                  <span className="text-zinc-300">System</span> when the server writes evidence — works on any DEPTH4 page, not only
                  Theses.
                </p>
              </div>
            ) : (
              filtered.map((a) => (
                <div
                  key={a.id}
                  data-testid={a.id === testRowId ? "thesis-alert-row" : undefined}
                  className={cn(
                    "group relative border-b border-white/[0.04] bg-zinc-900/20 pl-3 pr-2 py-3 last:border-0",
                    !a.read && "border-l-2 border-l-amber-500/55",
                  )}
                >
                  <div className="absolute right-1 top-2">
                    <button
                      type="button"
                      data-testid={a.id === testRowId ? "thesis-alert-dismiss" : undefined}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 opacity-70 hover:bg-zinc-900/60 hover:text-zinc-200 hover:opacity-100"
                      aria-label="Dismiss alert"
                      title="Dismiss"
                      onClick={() => dismissAlert(a.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="pr-9">
                    <p className="text-[11px] font-semibold leading-snug text-zinc-200">{normalizeThesisDisplayTitle(a.thesisTitle)}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">{a.confirmText}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{a.consequenceText}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[10px] tabular-nums text-zinc-600">
                        {new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <Link
                        href={`/theses/${encodeURIComponent(resolveThesisDetailSlug(a.thesisId))}`}
                        className="text-[10px] font-semibold text-zinc-400 hover:text-zinc-200"
                      >
                        View thesis →
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
