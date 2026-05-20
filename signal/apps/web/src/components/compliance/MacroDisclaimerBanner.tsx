"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "depth4.macro-disclaimer.dismissed.v1";

const DISMISS_PATH_PREFIXES = ["/theses", "/feed", "/track-record", "/book"] as const;

function pathShowsDisclaimer(pathname: string): boolean {
  return DISMISS_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function MacroDisclaimerBanner() {
  const pathname = usePathname() ?? "";
  const [dismissed, setDismissed] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
    setReady(true);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }, []);

  if (!ready || dismissed || !pathShowsDisclaimer(pathname)) return null;

  return (
    <div
      role="note"
      aria-label="Research disclaimer"
      className={cn(
        "border-b border-[#E8473F]/25 bg-[#111110]/95",
        "px-5 py-2.5 text-[12px] leading-snug text-zinc-300",
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1">
          <span className="mr-1.5 text-[#E8473F]" aria-hidden>
            ⚠️
          </span>
          <span className="font-medium text-zinc-200">DEPTH4 provides macro analysis, not financial advice.</span>{" "}
          All theses are AI-generated research hypotheses. Always conduct your own due diligence before making
          investment decisions.{" "}
          <Link href="/risk" className="text-[#E8473F] underline-offset-2 hover:underline">
            Learn more →
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8473F]/50"
          aria-label="Dismiss disclaimer"
        >
          ✕ Dismiss
        </button>
      </div>
    </div>
  );
}
