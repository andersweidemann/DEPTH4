"use client";

import type { LiveTradePlan, Thesis } from "@/lib/thesis-engine-v2/types";
import {
  formatEntryZoneLabel,
  formatTradePlanPrice,
} from "@/lib/thesis-engine-v2/live-trade-plan";
import { StatusBadge } from "./StatusBadge";
import { useEffect, useState } from "react";

const PENDING_ENTRY = "Awaiting live setup";
const PENDING_STOP = "Will appear with a valid trigger";
const PENDING_TGT = "Pending live plan";

const HELPER_LIVE =
  "Live levels from DEPTH4 — see Trade above for how to execute when your setup fires.";
const HELPER_PENDING =
  "Estimated levels appear when the thesis is Ready or Active with a directional setup and live quotes load — see Trade above for context.";

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

export function TradePlanCard({ thesis }: { thesis: Thesis }) {
  const [plan, setPlan] = useState<LiveTradePlan | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/theses/trade-plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            asset: thesis.asset,
            direction: thesis.direction,
            status: thesis.status,
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
  }, [thesis.asset, thesis.direction, thesis.status]);

  const showLive = plan != null && levelsComplete(plan);
  const helperText = showLive ? HELPER_LIVE : HELPER_PENDING;

  const entryDisplay = showLive && plan ? formatEntryZoneLabel(plan) ?? PENDING_ENTRY : PENDING_ENTRY;
  const stopDisplay =
    showLive && plan && plan.stop != null ? formatTradePlanPrice(plan.stop) : PENDING_STOP;
  const t1Display =
    showLive && plan && plan.target1 != null ? formatTradePlanPrice(plan.target1) : PENDING_TGT;
  const t2Display =
    showLive && plan && plan.target2 != null ? formatTradePlanPrice(plan.target2) : PENDING_TGT;

  return (
    <section className="rounded-none bg-zinc-900/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Trade plan</h2>
        <StatusBadge status={thesis.status} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{helperText}</p>
      {showLive ? (
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
          Estimated from the latest daily close and recent volatility (ATR) — not a broker quote or guaranteed fill.
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
