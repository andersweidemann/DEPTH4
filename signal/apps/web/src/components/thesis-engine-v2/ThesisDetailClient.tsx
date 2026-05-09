"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { ThesisStarButton } from "@/components/thesis-engine-v2/ThesisStarButton";
import { AdvisoryLog } from "@/components/thesis-engine-v2/AdvisoryLog";
import { AnswerBlock } from "@/components/thesis-engine-v2/AnswerBlock";
import { EvidenceTimeline } from "@/components/thesis-engine-v2/EvidenceTimeline";
import { ScenarioPanel } from "@/components/thesis-engine-v2/ScenarioPanel";
import { ThesisHero } from "@/components/thesis-engine-v2/ThesisHero";
import { ThesisFourLevelCascade } from "@/components/thesis-engine-v2/ThesisFourLevelCascade";
import { ThesisAssistantPanel } from "@/components/thesis-engine-v2/ThesisAssistantPanel";
import { ThesisOutcomePanel } from "@/components/thesis-engine-v2/ThesisOutcomePanel";
import { TradePlanCard } from "@/components/thesis-engine-v2/TradePlanCard";
import { OpenPositionModal } from "@/components/thesis-engine-v2/OpenPositionModal";
import { MispricingAnalysis } from "@/components/thesis-engine-v2/MispricingAnalysis";
import { Tooltip } from "@/components/thesis-engine-v2/Tooltip";
import { MispricingTooltipContent } from "@/components/thesis-engine-v2/MispricingTooltipContent";
import { thesesLiveHeaderNeutral } from "@/lib/thesis-engine-v2/live-header-copy";
import { getThesisDetail } from "@/lib/thesis-engine-v2/mock-data";
import { bundleForUserThesis, getUserThesisBySlug } from "@/lib/thesis-engine-v2/user-theses";
import { closeReasonLabel } from "@/lib/thesis-engine-v2/close-reason";
import {
  DEPTH4_POSITIONS_CHANGED,
  latestClosedForThesis,
  openPositionForThesis,
  upsertPosition,
} from "@/lib/thesis-engine-v2/positions-store";
import { cn } from "@/lib/utils";
import type { ThesisDetailBundle } from "@/lib/thesis-engine-v2/types";
import { useThesisLiveOptional } from "@/lib/thesis-engine-v2/thesis-live-context";
import { useRequireFeature } from "@/lib/thesis-engine-v2/feature-gate";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { hasInsiderFlowMonitoring } from "@/lib/thesis-engine-v2/insider-flow-config";
import { EditInsiderFlowModal } from "@/components/thesis-engine-v2/EditInsiderFlowModal";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";

function withCatalogHeader(
  bundle: ThesisDetailBundle,
  catalog: { title?: string | null; microLabel?: string | null; body?: unknown | null },
): ThesisDetailBundle {
  const t = (catalog.title ?? "").trim();
  const m = (catalog.microLabel ?? "").trim();
  const hasBody = catalog.body !== undefined && catalog.body !== null;
  if (!t && !m && !hasBody) return bundle;
  let thesis = bundle.thesis;
  if (t) thesis = { ...thesis, title: t };
  if (m) thesis = { ...thesis, microLabel: m };
  thesis = mergeDbBodyIntoThesis(thesis, catalog.body ?? null);
  return { ...bundle, thesis };
}

function initialBundleForSlug(
  slug: string,
  catalogDisplayTitle: string | null | undefined,
  catalogMicroLabel: string | null | undefined,
  catalogBody: unknown | null | undefined,
): ThesisDetailBundle | null {
  const sys = getThesisDetail(slug);
  if (sys) return withCatalogHeader(sys, { title: catalogDisplayTitle, microLabel: catalogMicroLabel, body: catalogBody });
  const ut = getUserThesisBySlug(slug);
  if (ut) return bundleForUserThesis(ut);
  return null;
}

function notifyLabel(p: "any" | "major" | "consequence" | "mute") {
  switch (p) {
    case "any":
      return "Any change";
    case "major":
      return "Major changes";
    case "consequence":
      return "Consequence only";
    case "mute":
      return "Mute";
    default:
      return "Major changes";
  }
}

export function ThesisDetailClient({
  slug,
  layout = "page",
  onClose,
  catalogDisplayTitle = null,
  catalogMicroLabel = null,
  catalogBody = null,
}: {
  slug: string;
  layout?: "page" | "drawer";
  onClose?: () => void;
  /** When set, overrides catalog thesis title with `public.theses.title` (server read). */
  catalogDisplayTitle?: string | null;
  /** When set, overrides `public.theses.micro_label`. */
  catalogMicroLabel?: string | null;
  /** When set, merges `public.theses.body` JSON over mock narrative fields. */
  catalogBody?: unknown | null;
}) {
  const requireFeature = useRequireFeature();
  const liveOpt = useThesisLiveOptional();
  const [bundle, setBundle] = useState<ThesisDetailBundle | null>(() =>
    initialBundleForSlug(slug, catalogDisplayTitle, catalogMicroLabel, catalogBody),
  );
  const [openPos, setOpenPos] = useState(false);
  const [bookPulse, setBookPulse] = useState(0);
  const [alertsMenuOpen, setAlertsMenuOpen] = useState(false);
  const alertsMenuRef = useRef<HTMLDivElement>(null);
  const [editInsiderOpen, setEditInsiderOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!alertsMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!alertsMenuRef.current?.contains(e.target as Node)) setAlertsMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [alertsMenuOpen]);

  useEffect(() => {
    setBundle(initialBundleForSlug(slug, catalogDisplayTitle, catalogMicroLabel, catalogBody));
  }, [slug, catalogDisplayTitle, catalogMicroLabel, catalogBody]);

  useEffect(() => {
    if (!bundle) return;
    const t = window.setInterval(() => setBookPulse((n) => n + 1), 2000);
    return () => window.clearInterval(t);
  }, [bundle]);

  useEffect(() => {
    const on = () => setBookPulse((n) => n + 1);
    window.addEventListener(DEPTH4_POSITIONS_CHANGED, on);
    return () => window.removeEventListener(DEPTH4_POSITIONS_CHANGED, on);
  }, []);

  const bookSnap = useMemo(() => {
    void bookPulse;
    if (!bundle) return { open: null as ReturnType<typeof openPositionForThesis>, latest: null as ReturnType<typeof latestClosedForThesis> };
    return {
      open: openPositionForThesis(bundle.thesis.id),
      latest: latestClosedForThesis(bundle.thesis.id),
    };
  }, [bundle, bookPulse]);

  const insider = useMemo(() => {
    if (!bundle || !liveOpt) return null;
    const latest = liveOpt.insiderFlowAnomalies.find((a) => a.thesisId === bundle.thesis.id) ?? null;
    const applied = liveOpt.insiderFlowScenarioOverride(bundle.thesis.id);
    const suggested = liveOpt.insiderFlowScenarioSuggestion(bundle.thesis.id);
    return { latest, applied, suggested };
  }, [bundle, liveOpt]);

  const hasOpen = !!bookSnap.open;

  const thesisLive = useMemo(() => {
    if (!bundle) return null;
    return liveOpt ? liveOpt.mergeThesis(bundle.thesis) : bundle.thesis;
  }, [bundle, liveOpt]);

  const assistBundle = useMemo(() => {
    if (!bundle || !thesisLive) return null;
    return { ...bundle, thesis: thesisLive };
  }, [bundle, thesisLive]);

  const liveEvidence = useMemo(() => {
    if (!bundle || !liveOpt) return [];
    return liveOpt.evidenceLog.filter((r) => r.thesisId === bundle.thesis.id);
  }, [bundle, liveOpt]);

  const liveLine = useMemo(() => thesesLiveHeaderNeutral(), []);

  const scoreRow = (label: string, value: number, max: number) => {
    const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
    return (
      <div className="grid gap-2 sm:grid-cols-[160px_1fr_42px] sm:items-center">
        <div className="text-[11px] font-medium text-zinc-500">{label}</div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
          <div
            className={cn("h-full rounded-full", pct >= 70 ? "bg-amber-500/90" : "bg-zinc-600")}
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
        <div className="text-right text-[11px] tabular-nums text-zinc-400">
          {value}/{max}
        </div>
      </div>
    );
  };

  if (!bundle) {
    if (layout === "drawer") {
      return (
        <div className="px-4 py-10 sm:px-6">
          <p className="text-sm font-semibold text-zinc-100">Thesis not found</p>
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
            This slug doesn&apos;t match a system thesis or a stored user thesis in this browser session.
          </p>
          {onClose ? (
            <button
              type="button"
              className="mt-6 rounded-md border border-white/[0.08] bg-zinc-900/50 px-4 py-2.5 text-[12px] font-semibold text-zinc-200 hover:bg-zinc-900/70"
              onClick={onClose}
            >
              Close
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <>
        <AppHeader active="theses" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
        <main className="mx-auto max-w-3xl px-5 pb-24 pt-8">
          <Link
            href="/theses"
            className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-amber-500/90"
          >
            ← All theses
          </Link>
          <div className="mt-8 rounded-lg border border-white/[0.06] bg-zinc-900/25 p-5">
            <p className="text-sm font-semibold text-zinc-100">Thesis not found</p>
            <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
              This slug doesn&apos;t match a system thesis or a stored user thesis in this browser session.
            </p>
          </div>
        </main>
      </>
    );
  }

  const { evidence, scenarios, advisoryLog, relatedAssets } = bundle;
  const thesis = thesisLive!;
  const isUserThesis = bundle.thesis.origin === "user";
  const insiderMonitoring = hasInsiderFlowMonitoring(thesis.insiderFlow);
  const returnToPath = pathname && pathname.length > 0 ? pathname : `/theses/${slug}`;
  const entrySetupValid = thesis.status === "ready" && thesis.probability >= 55;
  const liveStarred = liveOpt?.isEffectivelyStarred(thesis.id) ?? false;
  const starDisabled = liveOpt ? !!liveOpt.starDisabledReason(thesis.id) : false;
  const mispricing = getThesisMispricing(thesis);

  const inner = (
    <>
      <div className={cn(layout === "drawer" ? "px-4 pb-6 pt-1 sm:px-5" : "mt-6")}>
        <ThesisHero thesis={thesis} />
      </div>

      {thesis.thesisCascade ? (
        <div className={cn("mt-6", layout === "drawer" && "px-4 sm:px-5")}>
          <ThesisFourLevelCascade thesis={thesis} />
        </div>
      ) : null}

      {layout === "drawer" ? (
        <div className="mt-3">
          <MispricingAnalysis m={mispricing} />
        </div>
      ) : null}

      {(entrySetupValid || hasOpen || bookSnap.latest) && (
        <div
          className={cn(
            "mt-3 rounded-lg bg-zinc-900/25 px-4 py-2.5 text-[12px] text-zinc-300 ring-1 ring-white/[0.03]",
            layout === "drawer" && "mx-4 sm:mx-5",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {hasOpen && (
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200 ring-1 ring-emerald-500/20">
                  In your book · Active position
                </span>
              )}
              {!hasOpen && bookSnap.latest ? (
                <span className="rounded bg-zinc-800/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-200 ring-1 ring-white/[0.08]">
                  Closed in Book
                </span>
              ) : null}
            </div>
            {!hasOpen && entrySetupValid && !bookSnap.latest ? (
              <span className="text-[11px] text-zinc-500">
                Probability crossed threshold{thesis.entryZone ? ` · entry zone ${thesis.entryZone}` : ""}.
              </span>
            ) : null}
          </div>
          {!hasOpen && bookSnap.latest ? (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-zinc-400">
              <span className="font-semibold text-zinc-200">Realized {bookSnap.latest.realizedPnl ?? "—"}</span>
              {bookSnap.latest.closeReason ? (
                <span className="text-zinc-500">· {closeReasonLabel(bookSnap.latest.closeReason)}</span>
              ) : null}
              {bookSnap.latest.closedAt ? (
                <span className="text-zinc-600">
                  ·{" "}
                  {new Date(bookSnap.latest.closedAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
              <Link href="/book-2" className="ml-auto text-[11px] font-semibold text-amber-200/90 hover:text-amber-100">
                View in Book →
              </Link>
            </div>
          ) : null}
        </div>
      )}

      <div
        className={cn(
          "mt-3 flex flex-wrap items-center justify-between gap-3",
          layout === "drawer" && "px-4 sm:px-5",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-600">
          {liveOpt ? (
            <ThesisStarButton
              dataTestId={`thesis-star-${thesis.slug}`}
              filled={liveStarred}
              disabled={starDisabled}
              title={
                starDisabled
                  ? (liveOpt.starDisabledReason(thesis.id) ?? undefined)
                  : liveStarred
                    ? "Starred — alerts on"
                    : "Star — bookmark and subscribe"
              }
              onClick={() => liveOpt.toggleStar(thesis.id)}
            />
          ) : null}
          {liveOpt ? (
            <div ref={alertsMenuRef} className="relative">
              {(() => {
                const pref = liveOpt.getNotifyPref(thesis.id);
                const disabled = !liveStarred;
                const label = notifyLabel(pref);
                return (
                  <>
                    <button
                      type="button"
                      className={cn(
                        "rounded-md px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide ring-1",
                        disabled
                          ? "cursor-not-allowed bg-zinc-900/20 text-zinc-600 ring-white/[0.06]"
                          : "bg-zinc-900/30 text-zinc-300 ring-white/[0.08] hover:bg-zinc-900/50 hover:text-zinc-100",
                        pref === "mute" && !disabled && "text-zinc-400",
                      )}
                      disabled={disabled}
                      onClick={() => setAlertsMenuOpen((v) => !v)}
                      title={disabled ? "Star this thesis to receive probability alerts." : "Alert sensitivity"}
                    >
                      Alerts · {label} ▾
                    </button>
                    {alertsMenuOpen && !disabled ? (
                      <div className="absolute left-0 top-full z-[120] mt-2 w-52 rounded-none bg-[#141416] ring-1 ring-white/[0.08]">
                        {(
                          [
                            ["any", "Any change"],
                            ["major", "Major changes"],
                            ["consequence", "Consequence only"],
                            ["mute", "Mute"],
                          ] as const
                        ).map(([k, lab]) => (
                          <button
                            key={k}
                            type="button"
                            className={cn(
                              "flex w-full items-center justify-between px-3 py-2 text-left text-[11px] text-zinc-200 hover:bg-zinc-900/60",
                              pref === k && "bg-zinc-900/40",
                            )}
                            onClick={() => {
                              liveOpt.setNotifyPref(thesis.id, k);
                              setAlertsMenuOpen(false);
                            }}
                          >
                            <span>{lab}</span>
                            {pref === k ? <span className="text-[10px] font-semibold text-amber-200/90">Selected</span> : null}
                          </button>
                        ))}
                        <div className="border-t border-white/[0.06] px-3 py-2 text-[10px] leading-snug text-zinc-500">
                          Starred theses only.
                        </div>
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : null}
          {/* Gating is handled inline on intent actions; avoid static “feature tier” labels here. */}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="thesis-drawer-open-position"
            className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-200/90 hover:bg-emerald-500/15"
            onClick={() => {
              requireFeature("positionTracking", "open-position", () => setOpenPos(true));
            }}
            title="Record a position in your Book linked to this thesis"
          >
            Open position
          </button>
          <Link
            href="/risk"
            className="rounded-md border border-white/[0.08] bg-zinc-900/20 px-3 py-2 text-[11px] font-medium text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200"
            title="Risk Disclosure"
          >
            Risk
          </Link>
        </div>
      </div>

      {layout === "drawer" && assistBundle ? (
        <div className={cn("mt-3", "px-4 sm:px-5")}>
          <ThesisAssistantPanel variant="drawer" bundle={assistBundle} openBookPosition={bookSnap.open} />
        </div>
      ) : null}

      <div className={cn("mt-6 grid gap-3 sm:grid-cols-2", layout === "drawer" && "px-4 sm:px-5")}>
        <AnswerBlock kicker="Why now">{thesis.whyNow}</AnswerBlock>
        <AnswerBlock kicker="What the market hasn't priced in yet">{thesis.whatsUnpriced}</AnswerBlock>
        <AnswerBlock kicker="Trigger">{thesis.trigger}</AnswerBlock>
        <AnswerBlock kicker="Trade">{thesis.trade}</AnswerBlock>
        {thesis.timeStop ? <AnswerBlock kicker="Time stop">{thesis.timeStop}</AnswerBlock> : null}
      </div>

      <div className={cn("mt-3", layout === "drawer" && "px-4 sm:px-5")}>
        <Link href="/help#read-a-thesis" className="text-[11px] font-medium text-zinc-600 hover:text-amber-200/90">
          How to read a thesis →
        </Link>
      </div>

      <div className={cn("mt-9 space-y-10", layout === "drawer" && "px-4 sm:px-5")}>
        {layout !== "drawer" && assistBundle ? (
          <ThesisAssistantPanel bundle={assistBundle} openBookPosition={bookSnap.open} />
        ) : null}

        <section className="rounded-lg border border-white/[0.06] bg-zinc-900/25 p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Why this thesis exists</h2>
          {thesis.whyThesisExists?.trim() ? (
            <div className="mt-4 max-w-prose space-y-3">
              {thesis.whyThesisExists
                .split(/\n\n+/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i} className="text-[12px] leading-relaxed text-zinc-300">
                    {para}
                  </p>
                ))}
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">What&apos;s really driving this</p>
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.hiddenDriver}</p>
              </div>
              <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">What happens next</p>
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.likelyPath}</p>
              </div>
              <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-4 sm:col-span-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Best way to trade it</p>
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.tradeExpression}</p>
              </div>
            </div>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
            <span className="text-zinc-600">Probability rationale · </span>
            {thesis.probabilityRationale}
          </p>
        </section>

        <section className="rounded-lg border border-white/[0.06] bg-zinc-900/25 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Qualification breakdown</h2>
            <Tooltip label={<MispricingTooltipContent m={mispricing} />}>
              <span className="text-[11px] tabular-nums text-zinc-400">Mispricing score {mispricing.score}/100</span>
            </Tooltip>
          </div>
          <div className="mt-5 grid gap-3">
            {scoreRow("Driver strength", thesis.scores.driverStrength, 20)}
            {scoreRow("Time compression", thesis.scores.timeCompression, 25)}
            {scoreRow("Market hasn't caught up yet", thesis.scores.marketMispricingScore, 25)}
            {scoreRow("Trade clarity", thesis.scores.tradeClarityScore, 15)}
            {scoreRow("Trigger clarity", thesis.scores.triggerClarityScore, 15)}
          </div>
        </section>

        <TradePlanCard thesis={thesis} />

        {isUserThesis && !insiderMonitoring ? (
          <section
            className={cn(
              "rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-5 ring-1 ring-amber-500/10",
              layout === "drawer" && "mx-4 sm:mx-5",
            )}
          >
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/80">Insider Flow</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-zinc-200">
              Add Insider Flow monitoring to track unusual options/market activity.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Star this thesis after saving so scheduled scans can pick it up.
            </p>
            <button
              type="button"
              className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/15"
              onClick={() => setEditInsiderOpen(true)}
            >
              Add Insider Flow setup
            </button>
          </section>
        ) : null}

        {isUserThesis && insiderMonitoring ? (
          <section
            className={cn(
              "rounded-lg border border-white/[0.06] bg-zinc-900/25 p-5",
              layout === "drawer" && "mx-4 sm:mx-5",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Insider Flow monitoring</h2>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Bull/bear symbols and headline tags are synced for server-side scans when this thesis is starred.
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md border border-white/[0.10] bg-zinc-900/40 px-3 py-2 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-900/60"
                onClick={() => setEditInsiderOpen(true)}
              >
                Edit setup
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Bull instruments", thesis.insiderFlow?.bullInstruments ?? []],
                ["Bear instruments", thesis.insiderFlow?.bearInstruments ?? []],
                ["Confirm tags", thesis.insiderFlow?.confirmTags ?? []],
                ["Contradict tags", thesis.insiderFlow?.contradictTags ?? []],
              ].map(([label, items]) => (
                <div key={String(label)}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{label}</p>
                  <div className="mt-2 flex min-h-[28px] flex-wrap gap-1.5">
                    {(items as string[]).length ? (
                      (items as string[]).map((x) => (
                        <span
                          key={`${label}-${x}`}
                          className="rounded bg-zinc-900/50 px-2 py-0.5 font-mono text-[10px] text-zinc-300 ring-1 ring-white/[0.06]"
                        >
                          {x}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-zinc-600">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!isUserThesis && insiderMonitoring ? (
          <section
            className={cn(
              "rounded-lg border border-white/[0.06] bg-zinc-900/20 p-5",
              layout === "drawer" && "mx-4 sm:mx-5",
            )}
          >
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Insider Flow monitoring (system)</h2>
            <p className="mt-1 text-[11px] text-zinc-500">Pre-configured for this catalog thesis — read only.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Bull instruments", thesis.insiderFlow?.bullInstruments ?? []],
                ["Bear instruments", thesis.insiderFlow?.bearInstruments ?? []],
                ["Confirm tags", thesis.insiderFlow?.confirmTags ?? []],
                ["Contradict tags", thesis.insiderFlow?.contradictTags ?? []],
              ].map(([label, items]) => (
                <div key={String(label)}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{label}</p>
                  <div className="mt-2 flex min-h-[28px] flex-wrap gap-1.5">
                    {(items as string[]).length ? (
                      (items as string[]).map((x) => (
                        <span
                          key={`${label}-${x}`}
                          className="rounded bg-zinc-900/50 px-2 py-0.5 font-mono text-[10px] text-zinc-300 ring-1 ring-white/[0.06]"
                        >
                          {x}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-zinc-600">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {liveEvidence.length > 0 ? (
          <section className="rounded-lg border border-white/[0.06] bg-zinc-900/25 p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Live evidence</h2>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Server-matched news developments for this thesis. Informational only — not investment advice.
            </p>
            <ul className="mt-4 space-y-3">
              {liveEvidence.slice(0, 24).map((r) => (
                <li key={r.id} className="border-b border-white/[0.05] pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">{r.eventType}</span>
                    <span className="text-[10px] tabular-nums text-zinc-500">
                      {new Date(r.createdAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-zinc-200">{r.description}</p>
                  {r.probabilityBefore && r.probabilityAfter ? (
                    <p className="mt-1 text-[11px] tabular-nums text-zinc-400">
                      Scenarios · Base {r.probabilityBefore.base}%→{r.probabilityAfter.base}% · Bull {r.probabilityBefore.bull}%→
                      {r.probabilityAfter.bull}% · Bear {r.probabilityBefore.bear}%→{r.probabilityAfter.bear}%
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <EvidenceTimeline items={evidence} />
        {/* Insider Flow row (thesis-aware) */}
        {insider?.latest ? (
          <div className="rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Insider Flow</p>
                <p className="mt-1 text-[12px] font-semibold text-zinc-200">
                  {insider.latest.patternType === "BULL_LEAK" ? "Bull leak detected" : "Bear leak detected"} ·{" "}
                  {insider.latest.status === "UNCONFIRMED_LEAK"
                    ? "Unconfirmed"
                    : insider.latest.status === "CONFIRMED_MOVE"
                      ? "Confirmed move"
                      : "Invalidated"}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{insider.latest.notes}</p>
              </div>
              {liveOpt && insider.suggested && !insider.applied ? (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200/90 hover:bg-amber-500/15"
                    onClick={() => liveOpt.applyInsiderFlowSuggestion(thesis.id)}
                  >
                    Apply suggestion
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-white/[0.08] bg-zinc-900/30 px-3 py-2 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-900/50"
                    onClick={() => liveOpt.dismissInsiderFlowSuggestion(thesis.id)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </div>
            {insider.applied || insider.suggested ? (
              <p className="mt-2 text-[11px] text-zinc-500">
                {insider.applied ? "Applied" : "Suggested"}: Base {((insider.applied ?? insider.suggested)!.base)}% · Bull{" "}
                {((insider.applied ?? insider.suggested)!.bull)}% · Bear {((insider.applied ?? insider.suggested)!.bear)}%
              </p>
            ) : null}
          </div>
        ) : null}

        <ScenarioPanel
          scenarios={(() => {
            if (!insider?.applied) return scenarios;
            return scenarios.map((s) =>
              s.label === "Base case"
                ? { ...s, probability: insider.applied!.base }
                : s.label === "Bull case"
                  ? { ...s, probability: insider.applied!.bull }
                  : { ...s, probability: insider.applied!.bear },
            );
          })()}
        />

        <AdvisoryLog
          updates={(() => {
            if (!insider?.latest || (!insider.applied && !insider.suggested)) return advisoryLog;
            const eff = insider.applied ?? insider.suggested;
            const line = `[${new Date(insider.latest.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}] Insider flow detected (${insider.latest.patternType === "BULL_LEAK" ? "bull" : "bear"}): suggested scenario update → Base ${eff!.base}%, Bull ${eff!.bull}%, Bear ${eff!.bear}%.`;
            return [
              { id: `${thesis.id}-if-${insider.latest.id}`, thesisId: thesis.id, timestamp: "Now", text: line },
              ...advisoryLog,
            ];
          })()}
        />
        <ThesisOutcomePanel thesis={thesis} layout={layout} />
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Related assets</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {relatedAssets.map((a) => (
              <div
                key={a.symbol}
                className="min-w-[140px] flex-1 rounded-lg border border-white/[0.06] bg-zinc-900/30 px-3 py-2"
              >
                <p className="font-mono text-xs font-medium text-zinc-200">{a.symbol}</p>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">{a.note}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );

  const modals = (
    <>
      <OpenPositionModal
        open={openPos}
        onOpenChange={setOpenPos}
        thesis={thesis}
        onCreate={(p) => {
          upsertPosition(p);
          liveOpt?.syncOpenIdsFromBook();
          setBookPulse((n) => n + 1);
        }}
      />
      <EditInsiderFlowModal
        thesis={isUserThesis ? bundle.thesis : null}
        open={editInsiderOpen}
        onOpenChange={setEditInsiderOpen}
        returnToPath={returnToPath}
        onSaved={(next) => {
          setBundle((b) => (b ? { ...b, thesis: next } : null));
        }}
      />
    </>
  );

  if (layout === "drawer") {
    return (
      <>
        {inner}
        {modals}
      </>
    );
  }

  return (
    <>
      <AppHeader active="theses" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-8">
        <Link href="/theses" className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-amber-500/90">
          ← All theses
        </Link>
        {inner}
      </main>
      {modals}
    </>
  );
}
