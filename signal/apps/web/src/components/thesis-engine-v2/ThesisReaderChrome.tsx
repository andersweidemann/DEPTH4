"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { thesisReaderShareUrl } from "@/lib/thesis-engine-v2/thesis-reader-mode";

export function ThesisReaderChrome({
  slug,
  shareTitle,
  publicMode = false,
}: {
  slug: string;
  /** Thesis title for native share sheet (optional). */
  shareTitle?: string;
  publicMode?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const canonicalShareUrl = useCallback(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return thesisReaderShareUrl(slug, origin);
  }, [slug]);

  const copyShareLink = useCallback(async () => {
    const url = canonicalShareUrl();
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: shareTitle?.trim() || "DEPTH4 macro thesis",
          text: shareTitle?.trim() || undefined,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    }
  }, [canonicalShareUrl, shareTitle]);

  return (
    <header className="mb-10 border-b border-white/[0.06] pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <Link href="/theses" className="font-medium text-zinc-500 transition-colors hover:text-[#E8473F]/90">
            DEPTH4
          </Link>
          <span className="text-zinc-700" aria-hidden>
            /
          </span>
          <span className="text-zinc-600">Reader</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copyShareLink()}
            className="rounded-md border border-white/[0.08] bg-zinc-900/40 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-[#E8473F]/30 hover:text-zinc-100"
          >
            {copied ? "Link copied" : "Copy share link"}
          </button>
          {publicMode ? (
            <Link
              href="/signup"
              className="rounded-md border border-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-200"
            >
              Join DEPTH4
            </Link>
          ) : (
            <Link
              href={`/theses/${encodeURIComponent(slug)}`}
              className="rounded-md border border-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-200"
            >
              Full view
            </Link>
          )}
        </div>
      </div>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E8473F]/80">Reader · macro thesis</p>
    </header>
  );
}
