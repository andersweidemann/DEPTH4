"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { thesisReaderShareUrl } from "@/lib/thesis-engine-v2/thesis-reader-mode";
import { cn } from "@/lib/utils";

type ShareStatus = "private" | "public";

export function ThesisReaderShareControls({
  slug,
  shareTitle,
  className,
}: {
  slug: string;
  shareTitle?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<ShareStatus>("private");
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/theses/${encodeURIComponent(slug)}/reader-public`);
      const j = (await res.json().catch(() => null)) as {
        enabled?: boolean;
        canManage?: boolean;
        status?: string;
      } | null;
      if (!res.ok) {
        setCanManage(false);
        return;
      }
      setStatus(j?.enabled ? "public" : "private");
      setCanManage(j?.canManage === true);
    } catch {
      setError("Could not load share settings.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyLink = useCallback(async () => {
    const url = thesisReaderShareUrl(slug, typeof window !== "undefined" ? window.location.origin : "");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [slug]);

  const togglePublic = useCallback(async () => {
    if (!canManage || saving) return;
    const next = status !== "public";
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/theses/${encodeURIComponent(slug)}/reader-public`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const j = (await res.json().catch(() => null)) as { enabled?: boolean } | null;
      if (!res.ok) {
        setError("Could not update share setting.");
        return;
      }
      setStatus(j?.enabled ? "public" : "private");
    } catch {
      setError("Could not update share setting.");
    } finally {
      setSaving(false);
    }
  }, [canManage, saving, slug, status]);

  if (loading) {
    return (
      <div className={cn("rounded-lg border border-white/[0.06] bg-zinc-900/30 px-4 py-3", className)}>
        <p className="text-[11px] text-zinc-600">Loading share settings…</p>
      </div>
    );
  }

  if (!canManage) return null;

  return (
    <section
      className={cn("rounded-lg border border-white/[0.06] bg-zinc-900/30 px-4 py-4", className)}
      aria-label="Reader share settings"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Share reader link</p>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
            {status === "public"
              ? "Public link enabled — anyone with the link can read this thesis in reader mode (no login)."
              : "Private — only signed-in DEPTH4 users can open this reader link."}
          </p>
        </div>
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            status === "public" ? "text-[#E8473F]/90" : "text-zinc-500",
          )}
        >
          {status === "public" ? "Public link enabled" : "Private"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void togglePublic()}
          className={cn(
            "rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors",
            status === "public"
              ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200"
              : "border-[#E8473F]/40 bg-[#E8473F]/10 text-[#E8473F] hover:bg-[#E8473F]/15",
          )}
        >
          {saving ? "Saving…" : status === "public" ? "Turn off public link" : "Enable public reader link"}
        </button>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="rounded-md border border-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-[#E8473F]/30 hover:text-zinc-100"
        >
          {copied ? "Link copied" : "Copy share link"}
        </button>
      </div>

      {status === "public" ? (
        <p className="mt-3 font-mono text-[10px] text-zinc-600">{thesisReaderShareUrl(slug, "https://depth4.com")}</p>
      ) : null}

      {error ? <p className="mt-2 text-[11px] text-red-400/90">{error}</p> : null}
    </section>
  );
}
