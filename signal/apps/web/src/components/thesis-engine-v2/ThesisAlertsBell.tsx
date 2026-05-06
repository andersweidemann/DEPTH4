"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";

export function ThesisAlertsBell() {
  const { alerts, unreadAlertCount, dismissAlert, dismissAllAlerts } = useThesisLive();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
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
            "absolute right-0 top-full z-[120] mt-2 w-[min(calc(100vw-2rem),22rem)] rounded-lg border border-white/[0.08] bg-[#141416] shadow-sm",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Thesis updates</p>
            {alerts.length > 0 ? (
              <button
                type="button"
                className="shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200/90 hover:bg-zinc-900/60"
                onClick={() => dismissAllAlerts()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-zinc-500">No alerts in your tray. Star a thesis or open a position to subscribe.</p>
            ) : (
              alerts.map((a) => (
                <div
                  key={a.id}
                  className="group relative border-b border-white/[0.04] border-l-2 border-l-amber-500/45 bg-zinc-900/20 pl-3 pr-2 py-3 last:border-0"
                >
                  <div className="absolute right-1 top-2">
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 opacity-70 hover:bg-zinc-900/60 hover:text-zinc-200 hover:opacity-100"
                      aria-label="Dismiss alert"
                      title="Dismiss"
                      onClick={() => dismissAlert(a.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="pr-9 whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-300">{a.body}</p>
                  <p className="mt-2 text-[10px] tabular-nums text-zinc-600">
                    {new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
