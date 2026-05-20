"use client";

import { useEffect, useRef, useState } from "react";
import { useThesesPagePreferences } from "@/hooks/use-theses-page-preferences";
import { cn } from "@/lib/utils";

type StatusPayload = {
  pipelineActive: boolean;
  queueSize: number;
  currentTask: string | null;
};

export function PipelineActivityBanner() {
  const { prefs } = useThesesPagePreferences();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [completeFlash, setCompleteFlash] = useState<string | null>(null);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (!prefs.showActivityBanner) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/system/status", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as StatusPayload & { ok?: boolean };
        if (cancelled) return;
        const activeNow = j.pipelineActive || j.queueSize > 0;
        if (wasActiveRef.current && !activeNow) {
          setCompleteFlash("Theses updated");
          window.setTimeout(() => setCompleteFlash(null), 3000);
        }
        wasActiveRef.current = activeNow;
        setStatus(j);
      } catch {
        // ignore
      }
    };

    void poll();
    const id = window.setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [prefs.showActivityBanner]);

  if (!prefs.showActivityBanner) return null;

  if (completeFlash) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-emerald-500/30 bg-[#111110]/95 px-4 py-2.5 text-center text-[12px] text-emerald-300"
        role="status"
      >
        ✓ {completeFlash}
      </div>
    );
  }

  if (!status?.pipelineActive && (status?.queueSize ?? 0) === 0) return null;

  const label =
    status?.currentTask ??
    (status?.queueSize
      ? `DEPTH4 is analyzing ${status.queueSize} headline${status.queueSize === 1 ? "" : "s"}…`
      : "DEPTH4 is analyzing new evidence…");

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 border-t border-[#E8473F]/25 bg-[#111110]/95 px-4 py-2.5",
        "text-[12px] text-zinc-300",
      )}
      role="status"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2">
        <span className="text-[#E8473F]" aria-hidden>
          ⚡
        </span>
        <span>{label}</span>
        <span
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#E8473F]"
          aria-hidden
        />
      </div>
    </div>
  );
}
