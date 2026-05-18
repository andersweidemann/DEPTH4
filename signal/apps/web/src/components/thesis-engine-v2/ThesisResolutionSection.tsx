"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { formatTimeAgo } from "@/lib/thesis-helpers";
import { detectAutoResolution } from "@/lib/thesis/resolution-detector";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { isTerminalThesis } from "@/lib/theses/thesis-lifecycle";
import type { ThesisLifecycleState } from "@/types/thesis";
import type { ThesisOutcomeKind, ThesisOutcomeRecord } from "@/types/thesis-outcome";
import { cn } from "@/lib/utils";

function formatDuration(days: number): string {
  if (days < 1) return "<1 day";
  if (days === 1) return "1 day";
  if (days < 14) return `${days} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "1 week" : `${weeks} weeks`;
}

function outcomeBadge(outcome: ThesisOutcomeKind) {
  switch (outcome) {
    case "won_clean":
      return (
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
          ✓ Won cleanly
        </span>
      );
    case "won_messy":
      return (
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
          ~ Won messily
        </span>
      );
    case "failed":
      return (
        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
          ✗ Failed
        </span>
      );
    case "expired":
      return (
        <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
          ○ Expired
        </span>
      );
    default:
      return (
        <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
          {outcome}
        </span>
      );
  }
}

export function ThesisResolutionSection({
  thesis,
  slug,
  layout,
  lifecycleState,
  isAuthenticated,
  embedded = false,
}: {
  thesis: Thesis;
  slug: string;
  layout: "page" | "drawer";
  lifecycleState?: ThesisLifecycleState;
  isAuthenticated: boolean;
  embedded?: boolean;
}) {
  const [outcome, setOutcome] = useState<ThesisOutcomeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [autoHint, setAutoHint] = useState<string | null>(null);

  const terminal =
    isTerminalThesis({ lifecycle_state: lifecycleState ?? thesis.lifecycle_state, status: thesis.status }) ||
    thesis.status === "resolved" ||
    thesis.status === "invalidated";

  const isLive = !terminal && (thesis.status === "active" || thesis.status === "ready" || thesis.status === "watching");

  const loadOutcome = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/theses/${encodeURIComponent(slug)}/outcome`, { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { outcome: ThesisOutcomeRecord | null };
      setOutcome(data.outcome ?? null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadOutcome();
  }, [loadOutcome]);

  useEffect(() => {
    if (terminal || outcome) return;
    const suggestion = detectAutoResolution({ thesis });
    if (suggestion) {
      setAutoHint(
        `Auto-check suggests ${suggestion.outcome.replace("_", " ")}${suggestion.catalyst ? `: ${suggestion.catalyst}` : ""}`,
      );
    }
  }, [thesis, terminal, outcome]);

  const resolve = async (kind: ThesisOutcomeKind) => {
    if (!isAuthenticated) {
      toast.error("Sign in to mark outcomes");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/theses/${encodeURIComponent(slug)}/resolve`, {
        method: "POST",
        body: JSON.stringify({ outcome: kind }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; outcome?: ThesisOutcomeRecord };
      if (!res.ok || !data.ok) {
        toast.error(friendlyApiMessage(data.error ?? "resolve_failed"));
        return;
      }
      setOutcome(data.outcome ?? null);
      toast.success("Thesis outcome recorded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resolve failed");
    } finally {
      setSubmitting(false);
    }
  };

  const invalidate = async () => {
    if (!isAuthenticated) {
      toast.error("Sign in to mark outcomes");
      return;
    }
    const catalyst = window.prompt("What catalyst invalidated this thesis?");
    if (!catalyst?.trim()) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/theses/${encodeURIComponent(slug)}/invalidate`, {
        method: "POST",
        body: JSON.stringify({ catalyst: catalyst.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; outcome?: ThesisOutcomeRecord };
      if (!res.ok || !data.ok) {
        toast.error(friendlyApiMessage(data.error ?? "invalidate_failed"));
        return;
      }
      setOutcome(data.outcome ?? null);
      toast.success("Thesis marked invalidated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalidate failed");
    } finally {
      setSubmitting(false);
    }
  };

  const sectionClass = cn(
    "rounded-lg border border-white/[0.06] bg-zinc-900/20 p-4",
    !embedded && "mt-6",
    layout === "drawer" && "p-3.5",
  );

  if (loading) {
    return (
      <section className={sectionClass}>
        <p className="text-[11px] text-zinc-600">Loading resolution…</p>
      </section>
    );
  }

  if (outcome || terminal) {
    const o = outcome;
    return (
      <section
        className={cn(
          "rounded-lg border border-white/[0.08] bg-zinc-900/30 p-4",
          !embedded && "mt-6",
          layout === "drawer" && "p-3.5",
        )}
      >
        {o ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {outcomeBadge(o.outcome)}
              <span className="text-[10px] text-zinc-500">Resolved {formatTimeAgo(o.resolvedAt)}</span>
            </div>
            {o.holdDurationDays != null ? (
              <p className="mt-2 text-[12px] text-zinc-300">
                Hold: {formatDuration(o.holdDurationDays)}
                {o.pnl != null ? ` · P&L: ${o.pnl > 0 ? "+" : ""}${o.pnl}%` : ""}
              </p>
            ) : null}
            {o.catalyst ? <p className="mt-1 text-[11px] text-zinc-400">Catalyst: {o.catalyst}</p> : null}
            {o.reflection ? (
              <div className="mt-3 rounded-md border border-white/[0.06] bg-zinc-900/50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">AI reflection</p>
                <p className="mt-1 whitespace-pre-line text-[11px] text-zinc-400">{o.reflection}</p>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-600">Reflection generating…</p>
            )}
          </>
        ) : (
          <p className="text-[12px] text-zinc-400">This thesis is closed. No formal outcome record yet.</p>
        )}
      </section>
    );
  }

  if (!isLive) return null;

  return (
    <section
      className={cn(
        "rounded-lg border border-amber-500/20 bg-amber-500/5 p-4",
        !embedded && "mt-6",
        layout === "drawer" && "p-3.5",
      )}
    >
      {!embedded ? (
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Thesis resolution</p>
      ) : null}
      <p className={cn("text-[12px] text-zinc-400", embedded ? "mt-0" : "mt-1")}>
        When this thesis resolves, mark the outcome to build your track record.
      </p>
      {autoHint ? <p className="mt-2 text-[11px] text-amber-200/70">{autoHint}</p> : null}
      {!isAuthenticated ? (
        <p className="mt-3 text-[11px] text-zinc-500">Sign in to mark outcomes.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void resolve("won_clean")}
              className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              ✓ Won cleanly
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void resolve("won_messy")}
              className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              ~ Won messily
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void resolve("failed")}
              className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/20 disabled:opacity-50"
            >
              ✗ Failed
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void resolve("expired")}
              className="rounded-md border border-zinc-500/20 bg-zinc-500/10 px-3 py-1.5 text-[11px] text-zinc-400 hover:bg-zinc-500/20 disabled:opacity-50"
            >
              ○ Expired
            </button>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void invalidate()}
            className="mt-2 text-[10px] text-red-400/60 hover:text-red-400 disabled:opacity-50"
          >
            Mark as invalidated (catalyst triggered)
          </button>
        </>
      )}
    </section>
  );
}
