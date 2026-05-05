"use client";
import { useState, useCallback, useEffect } from "react";
import type {
  FeedViewModel,
  FeedVerification,
  WatchListTrigger3,
  TransmissionPly,
  LeadListItem,
  LeadTrafficLight,
  PricedInLevel,
} from "@/lib/feed-model";
import { SigBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";
import { ChevronDown, ChevronRight, ArrowDown, X } from "lucide-react";
import { ProPaywallCard } from "@/components/trader/ProPaywallCard";

function SourceBadge({ name }: { name: string }) {
  return (
    <span className="inline-block rounded border border-zinc-600 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-300">
      {name}
    </span>
  );
}

function VerificationHint({ v }: { v: FeedVerification }) {
  if (v.status === "unknown" && !v.basis && !v.flagForUser) return null;
  const warn = v.status === "unconfirmed" || Boolean(v.flagForUser?.startsWith("⚠️"));
  return (
    <div
      className={cn(
        "mt-2 rounded-lg border px-2.5 py-2 text-xs leading-snug",
        warn ? "border-rose-500/50 bg-rose-950/25 text-rose-100" : "border-zinc-600/60 bg-zinc-900/70 text-zinc-300",
      )}
    >
      <span className="font-semibold text-zinc-200">
        {v.status === "confirmed" ? "Verified (from article text) · " : v.status === "unconfirmed" ? "Unconfirmed · " : ""}
      </span>
      {v.flagForUser || v.basis || "No verification note."}
      {v.lastKnownDateHint ? (
        <span className="mt-1 block text-[10px] text-zinc-500">Date in text: {v.lastKnownDateHint}</span>
      ) : null}
    </div>
  );
}

const LEAD_LIGHTS_STORAGE = "depth4.leadLights.v1";

type LeadStore = Record<string, LeadTrafficLight[]>;

function readLeadStore(): LeadStore {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LEAD_LIGHTS_STORAGE) || "{}") as LeadStore;
  } catch {
    return {};
  }
}

function nextLight(c: LeadTrafficLight): LeadTrafficLight {
  const o: Record<LeadTrafficLight, LeadTrafficLight> = {
    red: "yellow",
    yellow: "green",
    green: "red",
  };
  return o[c];
}

function leadLightClass(light: LeadTrafficLight): string {
  switch (light) {
    case "green":
      return "border-emerald-500/50 bg-emerald-950/35";
    case "red":
      return "border-rose-500/50 bg-rose-950/35";
    default:
      return "border-amber-500/50 bg-amber-950/30";
  }
}

function leadDotClass(light: LeadTrafficLight): string {
  switch (light) {
    case "green":
      return "bg-emerald-400";
    case "red":
      return "bg-rose-400";
    default:
      return "bg-amber-400";
  }
}

const PRICED_NEWS_IN_STOCK_TIP =
  "Approximate share of this headline’s tradable information already reflected in this symbol (model estimate; not a price target or advice).";

const PRICED_IN_UI: Record<
  PricedInLevel,
  { line: string; abbr: string; ring: string; text: string }
> = {
  not_priced_in: {
    abbr: "▲",
    line: "Edge left",
    text: "This part of the story is not fully in the price yet.",
    ring: "text-emerald-300 border border-emerald-500/50 bg-emerald-950/40",
  },
  partial: {
    abbr: "~",
    line: "Partly in price",
    text: "Some of this is already in how stocks are trading.",
    ring: "text-amber-200 border border-amber-500/50 bg-amber-950/35",
  },
  priced_in: {
    abbr: "●",
    line: "Mostly priced in",
    text: "A lot of this is already priced; less surprise left in the obvious names.",
    ring: "text-rose-200 border border-rose-500/45 bg-rose-950/30",
  },
  unknown: {
    abbr: "…",
    line: "Not scored",
    text: "",
    ring: "text-zinc-500 border border-zinc-600/50 bg-zinc-900/50",
  },
};

function PlyPricedAndStocks({ p }: { p: TransmissionPly }) {
  const pi = PRICED_IN_UI[p.pricedIn];
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2" title={p.pricedIn === "unknown" ? undefined : pi.text}>
        <span className="text-[9px] font-semibold uppercase text-zinc-500">Priced in yet?</span>
        <span
          className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", pi.ring)}
          title={p.pricedIn === "unknown" ? undefined : pi.text}
        >
          <span className="tabular-nums font-mono" aria-hidden>
            {pi.abbr}
          </span>
          {p.pricedIn === "unknown" ? <span className="text-zinc-500"> model did not set</span> : <span>{pi.line}</span>}
        </span>
      </div>
      {p.stockIdeas.length > 0 && (
        <div className="rounded-lg border border-zinc-600/50 bg-zinc-900/60 px-2 py-1.5">
          <p className="text-[9px] font-semibold uppercase text-zinc-500 mb-0.5">
            {p.step >= 2 ? "Example names for this step" : "Names tied in here"}{" "}
            <span className="font-normal text-zinc-600 normal-case">(ideas only, not a buy list)</span>
          </p>
          <ul className="m-0 p-0 list-none space-y-1">
            {p.stockIdeas.map((s, k) => (
              <li key={`${s.ticker}-${k}`} className="text-xs text-zinc-200 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <span className="font-mono font-semibold text-cyan-300/90">{s.ticker}</span>
                  {s.newsPricedInPct != null ? (
                    <span
                      className="inline-flex items-center rounded-full bg-zinc-950/80 px-2 py-0.5 text-[10px] font-bold tabular-nums text-amber-200 ring-1 ring-amber-500/35"
                      title={PRICED_NEWS_IN_STOCK_TIP}
                    >
                      {s.newsPricedInPct}%
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-zinc-600" title={PRICED_NEWS_IN_STOCK_TIP}>
                      —%
                    </span>
                  )}
                </span>
                <span className="text-zinc-400">— {s.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.buyTrigger ? (
        <p className="text-[11px] text-sky-200/95 border-l-2 border-sky-500/50 pl-2 bg-sky-950/25 rounded-r">
          <span className="font-medium text-sky-400/90">Before buying, wait for: </span>
          {p.buyTrigger}
        </p>
      ) : null}
    </div>
  );
}

function LeadListWithTracking({ eventId, modelRows }: { eventId: string; modelRows: LeadListItem[] }) {
  const [rows, setRows] = useState<LeadListItem[]>(() => modelRows);
  const textKey = modelRows.length ? modelRows.map((r) => r.text).join("|\0|") : "";

  useEffect(() => {
    if (!textKey) {
      setRows(modelRows);
      return;
    }
    const s = readLeadStore()[eventId];
    if (!s || s.length !== modelRows.length) {
      setRows(modelRows.map((r) => ({ ...r })));
      return;
    }
    setRows(
      modelRows.map((r, i) => {
        const x = s[i] as string | undefined;
        if (x === "red" || x === "yellow" || x === "green") return { ...r, light: x };
        return { ...r };
      }),
    );
    // `modelRows` is the lines that produced `textKey` in the same render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, textKey]);

  if (!rows.length) return null;

  return (
    <div className="pt-1 border-t border-cyan-500/20">
      <p className="text-[10px] font-bold uppercase text-zinc-500 mb-0.5">What to watch</p>
      <p className="text-[11px] text-zinc-500 mb-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-0.5 align-middle" title="On track" /> On track
        <span className="mx-1.5" aria-hidden>
          ·
        </span>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-0.5 align-middle" title="Not sure yet" /> Not sure
        <span className="mx-1.5" aria-hidden>
          ·
        </span>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400 mr-0.5 align-middle" title="Off track / risk" /> Off track
        <span className="block sm:inline sm:ml-2 text-zinc-600">Row starts from the model; tap a row to cycle the light (saved on this device).</span>
      </p>
      <ul className="space-y-1.5 m-0 p-0 list-none">
        {rows.map((row, j) => (
          <li key={j} className="w-full min-w-0">
            <button
              type="button"
              onClick={() => {
                const next: LeadListItem[] = rows.map((r, i) => (i === j ? { ...r, light: nextLight(r.light) } : r));
                setRows(next);
                const st = readLeadStore();
                st[eventId] = next.map((r) => r.light);
                try {
                  localStorage.setItem(LEAD_LIGHTS_STORAGE, JSON.stringify(st));
                } catch {
                  /* */
                }
              }}
              className={cn(
                "w-full text-left rounded-md border pl-2 pr-2 py-1.5 text-[12px] text-zinc-100 flex gap-2 items-start",
                "hover:brightness-110 transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500/50",
                leadLightClass(row.light),
              )}
              title="Tap to cycle: red → yellow → green → red. Your pick is saved here."
            >
              <span className="flex shrink-0 items-center gap-0.5 pt-0.5" aria-hidden>
                <span className={cn("h-2 w-2 rounded-full", leadDotClass(row.light))} />
                <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase w-3.5">{row.light[0]}</span>
              </span>
              <span className="min-w-0 flex-1 leading-snug">{row.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ForwardPlyBlock({
  plies,
  eventId,
  leadList,
  horizon,
}: {
  plies: TransmissionPly[];
  eventId: string;
  leadList: LeadListItem[] | undefined;
  horizon: string | undefined;
}) {
  const hasPlies = plies.length > 0;
  const hasLeads = leadList && leadList.length > 0;
  if (!hasPlies && !hasLeads && !horizon?.trim()) return null;
  return (
    <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-950/25 p-3 space-y-3">
      {hasPlies && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-cyan-400/90">Forward — four steps in a row</p>
          <p className="text-[11px] text-cyan-200/70 mt-0.5">
            Depth 1 → 2 → 3 → 4, one after another. (Depth 3 is where the story can branch.) Short lines on purpose.
          </p>
          <p className="text-[10px] text-zinc-500 mt-1.5">
            <span className="text-amber-500/80">Not investment advice.</span> Example tickers, “priced in” tags, and buy
            triggers are for orientation only—not a recommendation to trade.
          </p>
        </div>
      )}
      {!hasPlies && hasLeads && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-cyan-400/90">Signals to watch</p>
          <p className="text-[11px] text-cyan-200/70 mt-0.5">A short checklist you can mark as you get new info.</p>
        </div>
      )}
      {hasPlies && (
      <ol className="space-y-3 list-none m-0 p-0">
        {plies.map((p, i) => (
          <li key={p.step + "-" + i} className="border-l-2 border-cyan-500/50 pl-3">
            <div className="flex flex-wrap items-baseline gap-2 text-[10px] text-cyan-500/90">
              <span>Depth {p.step}</span>
              {p.time_to_effect && p.time_to_effect !== "—" && <span>· {p.time_to_effect}</span>}
            </div>
            <p className="text-xs text-cyan-100/90 mt-0.5">
              <span className="text-zinc-400">Starting point: </span>
              <span className="font-medium text-cyan-50">{p.from_state}</span>
            </p>
            <p className="text-sm text-zinc-200 leading-relaxed my-1">{p.mechanism}</p>
            <p className="text-xs text-cyan-100/80">
              <span className="text-zinc-500">Then: </span>
              {p.to_state}
            </p>
            {p.lead_indicator ? (
              <p className="text-[11px] text-amber-200/90 mt-1.5 border-l-2 border-amber-500/40 pl-2">
                <span className="font-medium text-amber-500/80">Watch: </span>
                {p.lead_indicator}
              </p>
            ) : null}
            <PlyPricedAndStocks p={p} />
            {i < plies.length - 1 && (
              <div className="flex justify-center py-1" aria-hidden>
                <ArrowDown className="h-3.5 w-3.5 text-cyan-600" />
              </div>
            )}
          </li>
        ))}
      </ol>
      )}
      {horizon ? (
        <p className="text-sm text-cyan-100 border-t border-cyan-500/20 pt-2">
          <span className="text-cyan-500/90 font-medium">Time window: </span>
          {horizon}
        </p>
      ) : null}
      {leadList && leadList.length > 0 && <LeadListWithTracking eventId={eventId} modelRows={leadList} />}
    </div>
  );
}

function CausalChain({ l2 }: { l2: FeedViewModel["layer2"] }) {
  const steps = l2.chain.length > 0 ? l2.chain : [{ title: "Event", text: l2.anchorHeadline }];
  return (
    <div className="space-y-0">
      {steps.map((s, i) => (
        <div key={`${s.title}-${i}`}>
          {i > 0 && (
            <div className="flex justify-center py-0.5" aria-hidden>
              <ArrowDown className="h-4 w-4 text-zinc-500" />
            </div>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{s.title}</p>
          <p className="text-sm text-zinc-200 leading-relaxed mb-1 sm:text-base sm:leading-[1.6]">{s.text}</p>
        </div>
      ))}
      <p className="text-lg sm:text-xl font-semibold text-zinc-100 leading-snug border-t border-zinc-800 pt-3 mt-3">
        {l2.verdict}
      </p>
    </div>
  );
}

function boldParts(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return line;
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong className="font-semibold" key={i}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function WatchLineText({ w }: { w: WatchListTrigger3 }) {
  return <span className="text-zinc-200 leading-snug">{boldParts(w.line)}</span>;
}

function Layer3Scenarios({ view }: { view: FeedViewModel["layer3"] }) {
  return (
    <div className="space-y-3">
      {view.scenarios.map((s) => (
        <div key={s.id} className="rounded-xl border border-zinc-600/60 bg-zinc-900/50 p-3 space-y-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-zinc-100">{s.label}</span>
            <span className="text-right">
              <span className="block text-sm tabular-nums font-semibold text-orange-400">{s.probability}%</span>
              <span className="block text-[11px] text-amber-500/80 tabular-nums">
                ~{Math.round(s.probability * 0.6)}% of this move is unpriced
              </span>
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-orange-500" style={{ width: `${s.probability}%` }} />
          </div>
          <p className="text-sm text-zinc-200 leading-relaxed sm:text-base">{s.outcome}</p>
          <p className="text-xs text-zinc-500">
            <span>Market: </span>
            {s.marketImpact}
          </p>
          {s.winners.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase text-zinc-500">Winners</div>
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                {s.winners.map((t) => (
                  <span
                    key={t}
                    className="rounded border border-emerald-700/50 bg-emerald-950/50 px-2 py-0.5 text-xs font-medium text-emerald-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {s.losers.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase text-zinc-500">Losers</div>
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                {s.losers.map((t) => (
                  <span
                    key={t}
                    className="rounded border border-rose-700/50 bg-rose-950/30 px-2 py-0.5 text-xs font-medium text-rose-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {s.oneWatch && (
            <p className="text-xs text-amber-200 border-l-2 border-amber-500/60 pl-2 py-0.5 bg-amber-950/40 rounded-r">
              Watch: {String(s.oneWatch || "").replace(/^\s*watch:\s*/i, "")}
            </p>
          )}
        </div>
      ))}
      {view.scenarios.length === 0 && (
        <p className="text-sm text-zinc-500">Scenarios are still being built from the tree. Check back in a few minutes.</p>
      )}
      {view.watchList.length > 0 && (
        <div className="pt-2 border-t border-zinc-800">
          <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">WATCH list</h4>
          <ul className="space-y-1.5 text-sm">
            {view.watchList.map((w, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="shrink-0" aria-hidden>
                  {w.kind === "confirmA" && "🟢 "}
                  {w.kind === "activateC" && "🔴 "}
                  {w.kind === "wait" && "⏳ "}
                </span>
                <WatchLineText w={w} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BookL4({ l4, hook }: { l4: NonNullable<FeedViewModel["layer4"]>; hook: string }) {
  return (
    <div className="space-y-4">
      {l4.isPersonalized === false && (
        <p className="text-xs text-amber-200 border border-amber-700/50 bg-amber-950/50 rounded-lg px-2 py-1.5">
          Sign in and add positions for personalized P&amp;L. Below are event tickers only.
        </p>
      )}
      <section>
        <h4 className="text-xs font-bold uppercase text-zinc-500 mb-2">A — current positions</h4>
        {l4.positions.length === 0 ? (
          <p className="text-sm text-zinc-500">No position rows (no overlap or no quotes).</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-600/60 text-xs sm:text-sm">
            <table className="w-full min-w-[420px] text-left">
              <thead className="bg-zinc-800/80 text-[10px] sm:text-xs uppercase text-zinc-500">
                <tr>
                  <th className="p-2">Position</th>
                  <th className="p-2">Value (SEK)</th>
                  <th className="p-2">if A</th>
                  <th className="p-2">if C</th>
                  <th className="p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {l4.positions.map((r) => (
                  <tr key={r.position} className="border-t border-zinc-800">
                    <td className="p-2 font-medium text-zinc-100">{r.position}</td>
                    <td className="p-2 tabular-nums text-zinc-200">{r.valueSek}</td>
                    <td className="p-2 text-zinc-300">{r.impactScenarioA}</td>
                    <td className="p-2 text-zinc-300">{r.impactScenarioC}</td>
                    <td className="p-2 whitespace-nowrap text-zinc-200">{r.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h4 className="text-xs font-bold uppercase text-zinc-500 mb-2">B — open orders</h4>
        <ul className="space-y-3 text-sm">
          {l4.orders.length === 0 && <li className="text-zinc-500">No open limit orders in scope.</li>}
          {l4.orders.map((o) => (
            <li key={o.summary} className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
              <p className="font-medium text-zinc-100">{o.summary}</p>
              <p className="text-xs text-zinc-500">{o.distanceLine}</p>
              <p className="mt-1 text-zinc-300">
                <span className="font-medium">Scenario A:</span> {o.scenarioA.situation} — {o.scenarioA.rec}
              </p>
              <p className="text-zinc-300">
                <span className="font-medium">Scenario C:</span> {o.scenarioC.situation} — {o.scenarioC.rec}
              </p>
            </li>
          ))}
        </ul>
      </section>
      {l4.orderBookReview && l4.orderBookReview.length > 0 && (
        <section>
          <h4 className="text-xs font-bold uppercase text-zinc-500 mb-2">Model — order book vs scenario</h4>
          <ul className="space-y-2 text-sm text-zinc-200">
            {l4.orderBookReview.map((r, i) => (
              <li key={`${r.ticker}-${i}`} className="rounded-lg border border-sky-700/40 bg-sky-950/20 px-3 py-2">
                <p className="font-medium text-zinc-100">
                  {r.ticker}
                  {r.direction ? ` · ${r.direction}` : ""}
                  {r.limitPrice != null && !Number.isNaN(Number(r.limitPrice)) ? ` @ ${r.limitPrice}` : ""}{" "}
                  <span className="text-[10px] uppercase text-amber-300">{r.stance}</span>
                </p>
                <p className="mt-1 text-xs text-zinc-400">{r.rationale}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {l4.outsideDepotIdeas && l4.outsideDepotIdeas.length > 0 && (
        <section>
          <h4 className="text-xs font-bold uppercase text-zinc-500 mb-2">Model — outside depot</h4>
          <ol className="list-decimal pl-4 space-y-2 text-sm text-zinc-200">
            {l4.outsideDepotIdeas.map((x) => (
              <li key={x.ticker + x.linkedDepth}>
                <span className="font-semibold text-amber-200">{x.ticker}</span>{" "}
                <span className="text-zinc-500">({x.side}) · Depth {x.linkedDepth}</span>
                <p className="mt-0.5 text-zinc-300">{x.rationale}</p>
                <p className="text-xs text-zinc-500">{x.whyOutsideBook}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      <section>
        <h4 className="text-xs font-bold uppercase text-zinc-500 mb-2">C — watch list (not in book)</h4>
        {l4.watchlist.length === 0 ? (
          <p className="text-sm text-zinc-500">No ideas in this run.</p>
        ) : (
          <ol className="list-decimal pl-4 space-y-1.5 text-sm text-zinc-200">
            {l4.watchlist.map((w, i) => (
              <li key={i}>{boldParts(w.line)}</li>
            ))}
          </ol>
        )}
      </section>
      <p className="text-[10px] text-zinc-500">Not financial advice. {hook.slice(0, 80)}
        {hook.length > 80 ? "…" : ""}
      </p>
    </div>
  );
}

type SheetStep = "L2" | "L3" | "L4" | null;

export function FeedItemFourLayer({
  model,
  defaultOpenL2 = false,
  defaultOpenL4 = false,
  onEventFocus,
  proUnlocked = true,
  onDismiss,
}: {
  model: FeedViewModel;
  /** Desktop: expand L2 (story + forward plies) on first paint. Mobile: open L2 sheet. */
  defaultOpenL2?: boolean;
  defaultOpenL4?: boolean;
  onEventFocus?: () => void;
  /** L3 + L4 require Pro when false. Demo and previews pass true. */
  proUnlocked?: boolean;
  /** Hide this card (e.g. "not interested") in the app feed */
  onDismiss?: () => void;
}) {
  const hasL3 = model.layer3.scenarios.length > 0;
  const l4 = model.layer4;
  const [sheet, setSheet] = useState<SheetStep>(defaultOpenL4 && model.signalLevel >= 4 ? "L2" : null);
  const [dL2, setDL2] = useState(!!defaultOpenL2);
  const [dL3, setDL3] = useState(false);
  const [dL4, setDL4] = useState(false);
  const showLayer4 = Boolean(
    proUnlocked && l4 && dL2 && dL4 && (hasL3 ? dL3 : true),
  );
  const hasPremiumLayers = hasL3 || Boolean(l4);

  const fireFocus = useCallback(() => {
    onEventFocus?.();
  }, [onEventFocus]);

  useEffect(() => {
    if (!defaultOpenL2) return;
    const mq = window.matchMedia?.("(max-width: 767px)");
    if (mq?.matches) {
      setSheet("L2");
    }
  }, [defaultOpenL2]);

  const onHeadline = useCallback(() => {
    const isMobile = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 767px)").matches;
    if (isMobile) {
      setSheet("L2");
      fireFocus();
    } else {
      setDL2((prev) => {
        if (!prev) fireFocus();
        return !prev;
      });
    }
  }, [fireFocus]);

  useEffect(() => {
    if (defaultOpenL4 && model.signalLevel >= 4) fireFocus();
  }, [defaultOpenL4, model.signalLevel, fireFocus]);

  const openMobileL2 = useCallback(() => {
    setSheet("L2");
    fireFocus();
  }, [fireFocus]);

  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-600/50 bg-gradient-to-b from-zinc-900/95 to-zinc-950 p-3 sm:p-4 max-[479px]:px-4 text-left shadow-sm",
        model.signalLevel >= 4 && "ring-1 ring-red-500/40",
        model.signalLevel === 3 && "ring-1 ring-orange-500/40",
      )}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <SourceBadge name={model.source} />
          <SigBadge level={model.signalLevel} />
          {model.affectedUserTags.length > 0 && (
            <span className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-indigo-500/30 bg-indigo-950/50 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-indigo-200">
              Affects your {model.affectedUserTags.slice(0, 4).join(" · ")}
              {model.affectedUserTags.length > 4 && "…"}
            </span>
          )}
        </div>
        {onDismiss && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="shrink-0 h-8 w-8 text-zinc-500 hover:text-zinc-200"
            onClick={(ev) => {
              ev.stopPropagation();
              onDismiss();
            }}
            title="Not interested — hide this story from your feed"
            aria-label="Not interested"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <h3
        className="mt-3 cursor-pointer text-base sm:text-lg font-semibold text-zinc-100 leading-snug tracking-tight hover:underline break-words"
        onClick={onHeadline}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onHeadline();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={dL2 || sheet === "L2"}
      >
        {model.headline}
        <span className="ml-1 inline text-zinc-500">
          <ChevronRight className="inline h-4 w-4" aria-hidden />
        </span>
      </h3>
      <p className="mt-2 text-sm sm:text-base text-zinc-300 leading-relaxed">
        <span className="text-zinc-500" aria-hidden>→</span>{" "}
        <em className="not-italic font-medium text-zinc-100">{model.hook}</em>
      </p>
      {model.verification && <VerificationHint v={model.verification} />}
      <p className="mt-2 text-[10px] text-zinc-500 sm:hidden">Tap the headline for the full story (Depth 2).</p>

      <div className="mt-4 hidden md:block space-y-2">
        {dL2 && (
          <div className="border-l-4 border-indigo-500 pl-3 py-2">
            <p className="text-xs font-bold uppercase text-indigo-300 mb-2">Depth 2 — the story</p>
            {(model.layer2.transmissionPlies?.length ||
              model.layer2.earlyLeadList?.length ||
              model.layer2.forwardHorizonSummary) && (
              <ForwardPlyBlock
                plies={model.layer2.transmissionPlies ?? []}
                eventId={model.id}
                leadList={model.layer2.earlyLeadList}
                horizon={model.layer2.forwardHorizonSummary}
              />
            )}
            {(model.layer2.transmissionPlies?.length ||
              model.layer2.earlyLeadList?.length ||
              model.layer2.forwardHorizonSummary) && (
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 mb-1">Narrative</p>
            )}
            <CausalChain l2={model.layer2} />
            {proUnlocked && (
              <div className="pt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => hasL3 && setDL3((x) => !x)}
                  disabled={!hasL3}
                  className="w-full sm:w-auto border-zinc-600 bg-zinc-800/80 text-zinc-100 hover:bg-zinc-800"
                >
                  {dL3 ? "Hide" : "Scenarios & watch list"}{" "}
                  <ChevronDown className={cn("inline h-4 w-4", dL3 && "rotate-180")} />
                </Button>
                {!hasL3 && l4 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setDL4((x) => !x)}
                    className="w-full sm:w-auto border-zinc-600 bg-zinc-800/80 text-zinc-100 hover:bg-zinc-800"
                  >
                    {dL4 ? "Hide" : "Your book"}{" "}
                    <ChevronDown className={cn("inline h-4 w-4", dL4 && "rotate-180")} />
                  </Button>
                )}
              </div>
            )}
            {!proUnlocked && hasPremiumLayers && <div className="pt-2"><ProPaywallCard /></div>}
            {proUnlocked && !hasL3 && !l4 && (
              <p className="text-xs text-zinc-500 mt-1">Scenarios not available (no tree).</p>
            )}
          </div>
        )}
        {dL2 && dL3 && hasL3 && proUnlocked && (
          <div className="border-l-4 border-orange-500 pl-3 py-2">
            <p className="text-xs font-bold uppercase text-orange-300 mb-2">Depth 3 — what could happen</p>
            <Layer3Scenarios view={model.layer3} />
            <div className="pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => l4 && setDL4((x) => !x)}
                className="w-full sm:w-auto border-zinc-600 bg-zinc-800/80 text-zinc-100 hover:bg-zinc-800"
                disabled={!l4}
              >
                {dL4 ? "Hide" : "Your portfolio + actions"}{" "}
                <ChevronDown className={cn("inline h-4 w-4", dL4 && "rotate-180")} />
              </Button>
            </div>
            {!l4 && <p className="text-xs text-zinc-500 mt-1">Book depth unavailable (no data).</p>}
          </div>
        )}
        {showLayer4 && l4 && (
          <div className="border-l-4 border-emerald-500/90 pl-3 py-2">
            <p className="text-xs font-bold uppercase text-emerald-300 mb-2">Depth 4 — for you</p>
            <BookL4 l4={l4} hook={model.hook} />
          </div>
        )}
        {!dL2 && <p className="text-[11px] text-zinc-500">Click the headline to expand.</p>}
      </div>

      <div className="md:hidden">
        <Sheet
          open={!!sheet}
          onOpenChange={(o) => !o && setSheet(null)}
          title={sheet === "L2" ? "Depth 2" : sheet === "L3" ? "Depth 3" : sheet === "L4" ? "Depth 4" : "DEPTH4"}
          className="md:hidden"
        >
          <div className="pt-2">
            {sheet === "L2" && (
              <div>
                {(model.layer2.transmissionPlies?.length ||
                  model.layer2.earlyLeadList?.length ||
                  model.layer2.forwardHorizonSummary) && (
                  <ForwardPlyBlock
                    plies={model.layer2.transmissionPlies ?? []}
                    eventId={model.id}
                    leadList={model.layer2.earlyLeadList}
                    horizon={model.layer2.forwardHorizonSummary}
                  />
                )}
                {(model.layer2.transmissionPlies?.length ||
                  model.layer2.earlyLeadList?.length ||
                  model.layer2.forwardHorizonSummary) && (
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 mb-1">Narrative</p>
                )}
                <CausalChain l2={model.layer2} />
                {proUnlocked && (
                  <div className="mt-3 flex flex-col gap-2">
                    {hasL3 && (
                      <Button type="button" onClick={() => setSheet("L3")} className="w-full">
                        Scenarios →
                      </Button>
                    )}
                    {!hasL3 && l4 && (
                      <Button type="button" onClick={() => setSheet("L4")} className="w-full">
                        Your book →
                      </Button>
                    )}
                    {!hasL3 && !l4 && (
                      <Button type="button" disabled className="w-full" variant="secondary">
                        No scenarios or book
                      </Button>
                    )}
                  </div>
                )}
                {!proUnlocked && hasPremiumLayers && <div className="mt-3"><ProPaywallCard /></div>}
              </div>
            )}
            {sheet === "L3" && hasL3 && (
              <div>
                {proUnlocked ? (
                  <>
                    <Layer3Scenarios view={model.layer3} />
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button type="button" variant="secondary" onClick={() => setSheet("L2")} className="w-full sm:flex-1">
                        ← Story
                      </Button>
                      <Button
                        type="button"
                        onClick={() => (l4 ? setSheet("L4") : setSheet("L3"))}
                        className="w-full sm:flex-1"
                        disabled={!l4}
                      >
                        {l4 ? "You →" : "—"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <ProPaywallCard />
                    <div className="mt-3">
                      <Button type="button" variant="secondary" onClick={() => setSheet("L2")} className="w-full">
                        ← Story
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
            {sheet === "L4" && l4 && (
              <div>
                {proUnlocked ? (
                  <>
                    <BookL4 l4={l4} hook={model.hook} />
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button type="button" variant="secondary" onClick={() => setSheet(hasL3 ? "L3" : "L2")} className="w-full sm:flex-1">
                        ← {hasL3 ? "Scenarios" : "Story"}
                      </Button>
                      <Button type="button" onClick={() => setSheet(null)} className="w-full sm:flex-1" variant="outline">
                        Close
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <ProPaywallCard />
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button type="button" variant="secondary" onClick={() => setSheet(hasL3 ? "L3" : "L2")} className="w-full sm:flex-1">
                        ← {hasL3 ? "Scenarios" : "Story"}
                      </Button>
                      <Button type="button" onClick={() => setSheet(null)} className="w-full sm:flex-1" variant="outline">
                        Close
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </Sheet>
      </div>

      <div className="md:hidden border-t border-zinc-700/60 mt-3 pt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-zinc-600 bg-zinc-800/50 text-zinc-100"
          onClick={openMobileL2}
        >
          2 · Story
        </Button>
        {hasL3 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-zinc-600 bg-zinc-800/50 text-zinc-100"
            onClick={() => {
              setSheet("L3");
              fireFocus();
            }}
          >
            3 · Scenarios
          </Button>
        )}
        {l4 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-zinc-600 bg-zinc-800/50 text-zinc-100"
            onClick={() => {
              setSheet("L4");
              fireFocus();
            }}
          >
            4 · You
          </Button>
        )}
      </div>
    </div>
  );
}
