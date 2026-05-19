"use client";

import { useEffect, useState } from "react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { THESIS_DETAIL_TOOLTIPS } from "@/lib/thesis-engine-v2/depth-tooltips";
import { cn } from "@/lib/utils";
import type { QualityReport } from "@/lib/thesis/quality-gate";

export function ThesisQualityPanel({ slug }: { slug: string }) {
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/theses/${encodeURIComponent(slug)}/quality`, { credentials: "include" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
          throw new Error(body.message || body.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as QualityReport;
        if (!cancelled) setQuality(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load quality");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return <p className="text-[11px] text-zinc-600">Loading quality score…</p>;
  }

  if (error || !quality) {
    return <p className="text-[11px] text-zinc-600">{error ?? "Quality data unavailable"}</p>;
  }

  return (
    <div className="mt-4 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
      <div className="flex items-center justify-between">
        <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Quality score
          <InfoTooltip text={THESIS_DETAIL_TOOLTIPS.qualityScore} maxWidth={220} />
        </p>
        <span
          className={cn(
            "text-[14px] font-bold tabular-nums",
            quality.score >= 65
              ? "text-emerald-400"
              : quality.score >= 45
                ? "text-[#E8473F]"
                : "text-red-400",
          )}
        >
          {quality.score}/100
        </span>
      </div>

      <div className="mt-2 space-y-1">
        {quality.checks.map((check) => (
          <div key={check.name} className="flex items-start gap-2 text-[11px]">
            <span className={cn("shrink-0", check.passed ? "text-emerald-400" : "text-red-400")}>
              {check.passed ? "✓" : "✗"}
            </span>
            <span className={check.passed ? "text-zinc-400" : "text-red-400/80"}>{check.message}</span>
          </div>
        ))}
      </div>

      {quality.blockers.length > 0 ? (
        <p className="mt-2 text-[11px] text-red-400">Blocked: {quality.blockers.join(", ")}</p>
      ) : null}

      {!quality.canPromote ? (
        <p className="mt-1 text-[10px] text-zinc-600">
          Promotion target: {quality.promotionTarget} — resolve blockers to promote further.
        </p>
      ) : null}
    </div>
  );
}
