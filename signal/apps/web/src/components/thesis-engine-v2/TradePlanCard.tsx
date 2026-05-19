"use client";

import type { LiveTradePlan, Thesis } from "@/lib/thesis-engine-v2/types";
import {
  formatEntryZoneLabel,
  formatTradePlanPrice,
} from "@/lib/thesis-engine-v2/live-trade-plan";
import {
  assetSymbolFromThesis,
  storedTradePlanFromThesis,
} from "@/lib/thesis-engine-v2/stored-trade-plan";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { THESIS_DETAIL_TOOLTIPS } from "@/lib/thesis-engine-v2/depth-tooltips";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { canonicalConvictionPercentFromEngineThesis } from "@/lib/thesis-engine-v2/thesis-display-selectors";

const PENDING_ENTRY = "Awaiting live setup";
const PENDING_STOP = "Will appear with a valid trigger";
const PENDING_TGT = "Pending live plan";

const HELPER_LIVE =
  "Live levels from DEPTH4 — see Trade above for how to execute when your setup fires.";
const HELPER_PENDING =
  "Trade plan will appear when trigger conditions are met — see Trade above for context.";

type TradePlanApiOk = {
  ok: true;
  trade_plan: LiveTradePlan;
  quote_symbol?: string | null;
  as_of_ms?: number | null;
};

function levelsComplete(plan: LiveTradePlan): boolean {
  if (!plan.ready) return false;
  const ez = formatEntryZoneLabel(plan);
  return !!(ez && plan.stop != null && plan.target1 != null && plan.target2 != null);
}

export function TradePlanCard({
  thesis,
  variant = "default",
  publicMode = false,
}: {
  thesis: Thesis;
  variant?: "default" | "reader";
  publicMode?: boolean;
}) {
  const reader = variant === "reader";
  const stored = storedTradePlanFromThesis(thesis);
  const assetSymbol = assetSymbolFromThesis(thesis);
  const [plan, setPlan] = useState<LiveTradePlan | null>(null);
  const pathConviction = canonicalConvictionPercentFromEngineThesis(thesis);

  useEffect(() => {
    if (publicMode || stored) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await authFetch("/api/theses/trade-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset: thesis.asset,
            direction: thesis.direction,
            status: thesis.status,
            convictionPct: pathConviction,
          }),
        });
        const j = (await res.json().catch(() => null)) as TradePlanApiOk | { ok?: false } | null;
        if (cancelled) return;
        if (j && j.ok === true && j.trade_plan) {
          setPlan(j.trade_plan);
        } else {
          setPlan(null);
        }
      } catch {
        if (!cancelled) setPlan(null);
      }
    };
    void run();
    const t = window.setInterval(() => void run(), 90_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [publicMode, stored, thesis.asset, thesis.direction, thesis.status, pathConviction]);

  if (stored) {
    return (
      <section
        className={cn(
          reader ? "border-t border-white/[0.06] pt-8" : "rounded-lg border border-white/[0.08] bg-zinc-900/30 p-4",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Trade plan · {assetSymbol !== "—" ? assetSymbol : thesis.asset}
            <InfoTooltip text={THESIS_DETAIL_TOOLTIPS.tradePlan} maxWidth={200} />
          </h2>
          {!reader ? <StatusBadge status={thesis.status} /> : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">Entry</p>
            <p className="text-[13px] font-medium text-zinc-200">{stored.entry_zone}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">Stop</p>
            <p className="text-[13px] font-medium text-red-400">{stored.stop}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">Target 1</p>
            <p className="text-[13px] font-medium text-emerald-400">{stored.target1}</p>
          </div>
          {stored.target2 ? (
            <div>
              <p className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">Target 2</p>
              <p className="text-[13px] font-medium text-emerald-300">{stored.target2}</p>
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-[9px] text-zinc-600">
          Updated as thesis evolves. Stop may tighten on confirming news.
        </p>
      </section>
    );
  }

  const blocked = plan?.conviction_blocked === true;
  const showLive = plan != null && levelsComplete(plan) && !blocked;
  const helperText = blocked
    ? "Entry zone withheld while thesis conviction is below 50% — raise path conviction or wait for cleaner odds before sizing."
    : showLive
      ? HELPER_LIVE
      : HELPER_PENDING;

  const entryDisplay =
    showLive && plan ? (formatEntryZoneLabel(plan) ?? PENDING_ENTRY) : blocked ? "—" : PENDING_ENTRY;
  const stopDisplay =
    showLive && plan && plan.stop != null ? formatTradePlanPrice(plan.stop) : blocked ? "—" : PENDING_STOP;
  const t1Display =
    showLive && plan && plan.target1 != null ? formatTradePlanPrice(plan.target1) : blocked ? "—" : PENDING_TGT;
  const t2Display =
    showLive && plan && plan.target2 != null ? formatTradePlanPrice(plan.target2) : blocked ? "—" : PENDING_TGT;

  if (!showLive && (entryDisplay === PENDING_ENTRY || entryDisplay === "Awaiting live setup")) {
    return (
      <section
        className={cn(
          reader ? "border-t border-white/[0.06] pt-8" : "rounded-lg border border-white/[0.08] bg-zinc-900/30 p-4",
        )}
      >
        <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Trade plan
          <InfoTooltip text={THESIS_DETAIL_TOOLTIPS.tradePlan} maxWidth={200} />
        </p>
        <p className="mt-2 text-[12px] text-zinc-400">Trade plan will appear when trigger conditions are met.</p>
      </section>
    );
  }

  return (
    <section className={cn(reader ? "border-t border-white/[0.06] pt-8" : "rounded-none bg-zinc-900/25 p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Trade plan{assetSymbol !== "—" ? ` · ${assetSymbol}` : ""}
          <InfoTooltip text={THESIS_DETAIL_TOOLTIPS.tradePlan} maxWidth={200} />
        </h2>
        {!reader ? <StatusBadge status={thesis.status} /> : null}
      </div>
      {!reader ? <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{helperText}</p> : null}
      {!reader && showLive ? (
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
          Estimated from the latest daily close and recent volatility (ATR) — not a broker quote or guaranteed fill.
        </p>
      ) : null}
      {plan?.rr_check_label ? (
        <p
          className={`mt-2 text-[11px] leading-relaxed ${plan.levels_need_adjustment ? "text-amber-200/85" : "text-zinc-500"}`}
        >
          {plan.rr_check_label}
        </p>
      ) : null}
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-zinc-600">Entry zone</dt>
          <dd className="mt-1 font-mono text-sm text-zinc-200">{entryDisplay}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-zinc-600">Stop</dt>
          <dd className="mt-1 font-mono text-sm text-zinc-200">{stopDisplay}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-zinc-600">Target 1</dt>
          <dd className="mt-1 font-mono text-sm text-zinc-200">{t1Display}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-zinc-600">Target 2</dt>
          <dd className="mt-1 font-mono text-sm text-zinc-200">{t2Display}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[10px] uppercase tracking-wider text-zinc-600">Time horizon</dt>
          <dd className="mt-1 text-sm text-zinc-300">{thesis.horizon}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[10px] uppercase tracking-wider text-zinc-600">Recommendation</dt>
          <dd className="mt-1 text-sm capitalize text-zinc-200">{thesis.advisoryAction}</dd>
        </div>
      </dl>
    </section>
  );
}
