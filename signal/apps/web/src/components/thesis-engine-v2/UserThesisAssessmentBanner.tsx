"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import {
  isUserOwnedThesis,
  isUserThesisAssessing,
  isUserThesisTradeable,
  isUserThesisWatchingNoEdge,
  mispricingPctFromThesis,
} from "@/lib/thesis/user-thesis-lifecycle";

function userThesisNeedsMoreDetail(thesis: Thesis): boolean {
  if (thesis.qualityScore !== 0) return false;
  const hasCalibration = Boolean(thesis.userCalibration?.summary?.trim());
  return !hasCalibration && (thesis.status === "forming" || thesis.status === "watching");
}

export function UserThesisAssessmentBanner({
  thesis,
  className,
  onArchive,
}: {
  thesis: Thesis;
  className?: string;
  onArchive?: () => void;
}) {
  if (!isUserOwnedThesis(thesis)) return null;

  if (userThesisNeedsMoreDetail(thesis)) {
    return (
      <div
        className={cn(
          "rounded-lg border border-amber-500/25 bg-amber-500/[0.04] px-4 py-3",
          className,
        )}
        role="status"
        data-testid="user-thesis-needs-detail-banner"
      >
        <p className="text-[13px] font-medium text-amber-200/90">This thesis may need more detail</p>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
          DEPTH4 has not assigned a quality score yet. Add catalyst, trigger, and trade framing on the detail
          page, or wait for the assessment pass to finish — we do not auto-archive user hypotheses.
        </p>
      </div>
    );
  }

  if (isUserThesisAssessing(thesis)) {
    const asset = (thesis.asset ?? "").trim() || "this asset";
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-zinc-600/40 bg-zinc-900/30 px-4 py-3",
          className,
        )}
        role="status"
        aria-live="polite"
        data-testid="user-thesis-assessing-banner"
      >
        <p className="text-[13px] font-medium text-zinc-200">
          <span className="mr-1.5 inline-block animate-pulse text-[#E8473F]" aria-hidden>
            ⚡
          </span>
          DEPTH4 is assessing this thesis...
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">Checking:</p>
        <ul className="mt-1 list-inside list-disc text-[12px] leading-relaxed text-zinc-500">
          <li>Market context for {asset}</li>
          <li>Recent news and macro drivers</li>
          <li>Historical precedents for similar setups</li>
          <li>Current positioning and sentiment</li>
        </ul>
        <p className="mt-2 text-[12px] text-zinc-600">→ Will update with calibrated probabilities</p>
      </div>
    );
  }

  if (isUserThesisTradeable(thesis)) {
    const quality = thesis.userCalibration?.quality_score ?? thesis.qualityScore;
    const edge = mispricingPctFromThesis(thesis);
    return (
      <div
        className={cn(
          "rounded-lg border border-[#E8473F]/30 bg-[#E8473F]/[0.06] px-4 py-3",
          className,
        )}
        role="status"
        data-testid="user-thesis-tradeable-banner"
      >
        <p className="text-[13px] font-medium text-zinc-100">
          <span className="mr-1.5 text-emerald-400" aria-hidden>
            ✓
          </span>
          DEPTH4 assessment complete — promoted to tradeable
        </p>
        <p className="mt-1 text-[12px] text-zinc-400">
          Edge: {edge}/100
          {typeof quality === "number" ? ` · Quality: ${quality}/100` : null}
          {thesis.userCalibration?.mispricing_pct != null
            ? ` · Mispricing: ${thesis.userCalibration.mispricing_pct}%`
            : null}
        </p>
        {thesis.userCalibration?.summary ? (
          <p className="mt-1 text-[12px] text-zinc-500">{thesis.userCalibration.summary}</p>
        ) : null}
      </div>
    );
  }

  if (isUserThesisWatchingNoEdge(thesis)) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-amber-500/25 bg-amber-500/[0.04] px-4 py-3",
          className,
        )}
        role="status"
        data-testid="user-thesis-watching-banner"
      >
        <p className="text-[13px] font-medium text-amber-200/90">Thesis remains in watching</p>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
          {thesis.userCalibration?.summary ??
            "No clear edge detected yet. The market may already be pricing this scenario."}
        </p>
        <p className="mt-2 text-[12px] text-zinc-600">
          DEPTH4 will alert you if new evidence, mispricing, or related events develop.
        </p>
        {onArchive ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200"
              onClick={onArchive}
            >
              Archive thesis
            </button>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-zinc-600">
            Use <Link href="/theses" className="text-zinc-400 underline hover:text-zinc-200">Hide from view</Link> to
            archive from your list.
          </p>
        )}
      </div>
    );
  }

  return null;
}
