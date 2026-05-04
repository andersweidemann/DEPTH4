import type {
  FeedViewModel,
  FeedLayer2,
  FeedLayer3,
  FeedLayer4,
  FeedVerification,
  Sl,
  WatchListTrigger3,
  FeedScenario3,
  TransmissionPly,
  LeadListItem,
  LeadTrafficLight,
  PricedInLevel,
  PlyStockIdea,
  OrderBookReviewRow,
  OutsideDepotIdea,
} from "./feed-model";
import type { NewsItem, Tree, Pos, Ord, Q, ForwardModel } from "@/app/dashboard/types";

const MAX_HOOK = 12;

function wordClip(s: string, max = MAX_HOOK) {
  const w = s.trim().split(/\s+/).filter(Boolean);
  if (w.length <= max) return s.trim();
  return w.slice(0, max).join(" ") + "…";
}

type RawExt = {
  causal?: {
    anchor?: string;
    chain?: { title: string; text: string }[];
    verdict?: string;
  };
};

function parseRaw(raw: unknown): RawExt {
  if (!raw || typeof raw !== "object") return {};
  return raw as RawExt;
}

function parseVerification(raw: unknown): FeedVerification | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as Record<string, unknown>).verification;
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const st = String(o.status || "").toLowerCase();
  const status: FeedVerification["status"] =
    st === "confirmed" ? "confirmed" : st === "unconfirmed" ? "unconfirmed" : "unknown";
  return {
    status,
    basis: typeof o.basis === "string" ? o.basis : undefined,
    lastKnownDateHint: o.last_known_date_hint == null ? null : String(o.last_known_date_hint),
    flagForUser: o.flag_for_user == null ? null : String(o.flag_for_user),
  };
}

function parseOrderBookReview(fm: ForwardModel | undefined | null): OrderBookReviewRow[] | undefined {
  const raw = fm?.order_book_review;
  if (!raw?.length) return undefined;
  const out: OrderBookReviewRow[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const ticker = String(r.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;
    const stance = String(r.stance ?? "watch").trim() || "watch";
    const rationale = String(r.rationale ?? "").trim() || "—";
    const lp = r.limit_price;
    out.push({
      ticker,
      direction: typeof r.direction === "string" ? r.direction : undefined,
      limitPrice: typeof lp === "number" ? lp : lp != null && lp !== "" ? Number(lp) : null,
      stance,
      rationale,
    });
  }
  return out.length ? out : undefined;
}

function parseOutsideDepotIdeas(fm: ForwardModel | undefined | null): OutsideDepotIdea[] | undefined {
  const raw = fm?.outside_depot_ideas;
  if (!raw?.length) return undefined;
  const out: OutsideDepotIdea[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const ticker = String(r.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;
    const ld = typeof r.linked_depth === "number" ? r.linked_depth : Number(r.linked_depth);
    out.push({
      ticker,
      side: String(r.side ?? "long").trim() || "long",
      rationale: String(r.rationale ?? "").trim() || "—",
      linkedDepth: Number.isFinite(ld) ? Math.min(4, Math.max(1, Math.round(ld))) : 1,
      whyOutsideBook: String(r.why_outside_book ?? "").trim() || "—",
    });
  }
  return out.length ? out : undefined;
}

function defaultLayer2(n: NewsItem, body: string | null | undefined): FeedLayer2 {
  const r = parseRaw(n.raw_json);
  if (r.causal?.chain?.length) {
    return {
      anchorHeadline: r.causal.anchor || n.headline,
      chain: r.causal.chain.map((c) => ({ title: c.title, text: c.text })),
      verdict: r.causal.verdict || "Track follow-up wires before changing risk.",
    };
  }
  const reason = (n as { reasoning?: string }).reasoning;
  return {
    anchorHeadline: n.headline,
    chain: [
      { title: "Event", text: n.headline },
      { title: "Context", text: (body || "").slice(0, 280) || "Details still developing." },
      { title: "Read", text: reason || n.one_line_summary || "Watch how markets reprice the risk." },
    ],
    verdict: "Verify with your own process—this is machine context, not advice.",
  };
}

function parsePricedIn(v: unknown): PricedInLevel {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!s || s === "—") return "unknown";
  if (
    s === "not_priced_in" ||
    s === "not priced in" ||
    s.replace(/-/g, " ") === "not priced in" ||
    s.includes("not_priced") ||
    s === "edge"
  ) {
    return "not_priced_in";
  }
  if (s === "partial" || s === "part" || s.includes("partly") || s.includes("partial")) {
    return "partial";
  }
  if (s === "priced_in" || s === "priced in" || s === "largely_priced" || s.includes("mostly priced") || s === "fully_priced") {
    return "priced_in";
  }
  return "unknown";
}

function stockIdeasFromRow(x: Record<string, unknown>): PlyStockIdea[] {
  const arr = x.stock_ideas;
  if (!arr || !Array.isArray(arr)) return [];
  const out: PlyStockIdea[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const t = String(o.ticker ?? o.symbol ?? "")
      .trim()
      .toUpperCase();
    if (!t) continue;
    const note = String(o.note ?? o.rationale ?? o.reason ?? "").trim();
    out.push({ ticker: t, note: note || "—" });
  }
  return out.slice(0, 4);
}

function pliesFromForwardModel(fm: ForwardModel | undefined | null): TransmissionPly[] | undefined {
  const raw = fm?.transmission_chain;
  if (!raw?.length) return undefined;
  return raw.slice(0, 6).map((x, i) => {
    const from = String(x.from_state ?? (x as { from?: string }).from ?? "—").trim() || "—";
    const to = String(x.to_state ?? (x as { to?: string }).to ?? "—").trim() || "—";
    const mech = String(x.mechanism ?? "—").trim() || "—";
    const stepN = typeof x.step === "number" && (x as { step: number }).step >= 1 && (x as { step: number }).step <= 9 ? (x as { step: number }).step : i + 1;
    const row = x as Record<string, unknown>;
    const pi = parsePricedIn(row.priced_in);
    const stocks = stockIdeasFromRow(row);
    const buyTrigger = String(row.buy_trigger ?? "")
      .trim();
    return {
      step: stepN,
      from_state: from,
      mechanism: mech,
      to_state: to,
      time_to_effect: String(x.time_to_effect ?? "").trim() || "—",
      lead_indicator: String(x.lead_indicator ?? "").trim(),
      pricedIn: pi,
      stockIdeas: stocks,
      buyTrigger,
    };
  });
}

/** Prefer consequence-tree forward model so L2 can show the serial chain ahead of the narrative. */
function parseLight(v: unknown): LeadTrafficLight {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "red" || s === "green" || s === "yellow") return s;
  return "yellow";
}

function leadListFromForward(fm: ForwardModel | undefined | null): LeadListItem[] | undefined {
  const raw = fm?.early_lead_indicators;
  if (!raw?.length) return undefined;
  const out: LeadListItem[] = [];
  for (const x of raw) {
    if (typeof x === "string") {
      const t = x.trim();
      if (t) out.push({ text: t, light: "yellow" });
      continue;
    }
    if (x && typeof x === "object" && (("text" in (x as object)) || "signal" in (x as object))) {
      const t = String(
        (x as { text?: unknown; signal?: unknown }).text ?? (x as { signal?: unknown }).signal,
      ).trim();
      if (!t) continue;
      const l = (x as { light?: unknown }).light;
      out.push({ text: t, light: parseLight(l) });
    }
  }
  return out.length ? out : undefined;
}

function mergeLayer2Forward(tree: Tree | null | undefined, base: FeedLayer2): FeedLayer2 {
  const plies = pliesFromForwardModel(tree?.forward_model);
  const fm = tree?.forward_model;
  const leadList = leadListFromForward(fm);
  const horizon = (fm?.forward_horizon_summary || "").trim();
  if (!plies?.length && !leadList?.length && !horizon) return base;
  return {
    ...base,
    transmissionPlies: plies && plies.length ? plies : undefined,
    earlyLeadList: leadList,
    forwardHorizonSummary: horizon || undefined,
  };
}

function marketImpString(m: Record<string, string> | string | undefined | null): string {
  if (m == null) return "— (see story)";
  if (typeof m === "string") return m;
  return Object.entries(m)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
}

/** LLM may return scenarios as array, keyed object, or alternate field names (Haiku / partial JSON). */
function scenarioRowsFromTree(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const vals = Object.values(raw as Record<string, unknown>).filter((x) => x && typeof x === "object");
    return vals as Record<string, unknown>[];
  }
  return [];
}

function fromTreeToLayer3(t: Tree | null | undefined): FeedLayer3 {
  if (!t) {
    return { scenarios: [], watchList: buildWatchFromStrings([], []) };
  }
  const wSig = (t.watch_signals as string[] | undefined) || [];
  const sc = scenarioRowsFromTree(t.scenarios as unknown);
  if (!sc.length) {
    return { scenarios: [], watchList: buildWatchFromStrings(wSig, []) };
  }
  const scenarios: FeedScenario3[] = sc.map((s, i) => {
    const label =
      String(s.label ?? s.name ?? s.title ?? s.id ?? `Scenario ${i + 1}`).trim() || `Scenario ${i + 1}`;
    const probRaw = s.probability ?? s.pct ?? s.weight;
    const prob =
      typeof probRaw === "number" && Number.isFinite(probRaw)
        ? probRaw
        : typeof probRaw === "string" && probRaw.trim()
          ? Number.parseFloat(probRaw)
          : 0;
    const wn = Array.isArray(s.winners)
      ? (s.winners as { ticker?: string }[]).map((x) => String(x?.ticker ?? "").trim()).filter(Boolean)
      : [];
    const ls = Array.isArray(s.losers)
      ? (s.losers as { ticker?: string }[]).map((x) => String(x?.ticker ?? "").trim()).filter(Boolean)
      : [];
    const wOne =
      String(s.watch_one ?? s.watch ?? "").trim() ||
      (i === 0 && wSig[0] ? `Confirmed if: ${wSig[0]}` : `Watch: ${label} drivers`);
    return {
      id: `${i}-${label}`,
      label,
      probability: Math.min(100, Math.max(0, Number.isFinite(prob) ? prob : 0)),
      outcome: String(s.outcome ?? s.summary ?? s.description ?? "").trim() || "—",
      marketImpact: marketImpString(s.market_impact as Record<string, string> | string | undefined | null),
      winners: wn,
      losers: ls,
      oneWatch: wOne,
    };
  });
  return { scenarios, watchList: buildWatchFromStrings(wSig, scenarios) };
}

function buildWatchFromStrings(
  ws: string[],
  sc: { label: string }[],
): WatchListTrigger3[] {
  if (ws.length >= 3) {
    return [
      { kind: "confirmA" as const, line: String(ws[0] ?? "") },
      { kind: "activateC" as const, line: String(ws[1] ?? "") },
      { kind: "wait" as const, line: String(ws[2] ?? "") },
    ];
  }
  const a = sc[0];
  const c = sc.length > 1 ? sc[sc.length - 1] : undefined;
  return [
    {
      kind: "confirmA" as const,
      line: a
        ? `**${a.label}** leans on follow-through from the first scenario`
        : "Bullish catalyst confirms path A (watch flow)",
    },
    {
      kind: "wait" as const,
      line: "No major new headline in 4h means process, not resolution",
    },
    {
      kind: "activateC" as const,
      line: c
        ? `**${c.label}** if tail risks start pricing`
        : "Spike in vol / crude beta → re-read tail",
    },
  ];
}

function norm(t: string) {
  return t.toUpperCase().split(".", 1)[0] || "";
}

export function buildLayer4(
  n: NewsItem,
  t: Tree | null | undefined,
  positions: Pos[],
  orders: Ord[],
  quotes: Record<string, Q>,
): FeedLayer4 {
  const sc = (t?.scenarios as
    | {
        label: string;
        portfolio_impact?: { summary?: string; affected_positions?: string[]; estimated_impact_sek?: string };
        order_recommendations?: { ticker: string; action: string; reason: string }[];
      }[]
    | undefined) || [];
  const labelA = sc[0];
  const labelC = sc[sc.length - 1] ?? sc[0];
  const aff = (n.affected_tickers || []).map(norm);
  const inStory = (tk: string) => aff.length === 0 || aff.includes(norm(tk));
  const rows: FeedLayer4["positions"] = [];
  for (const p of positions) {
    if (!inStory(p.ticker)) continue;
    const q = quotes[p.ticker] as Q | undefined;
    const v = q?.price_sek && p.quantity ? Math.round(q.price_sek * +p.quantity) : null;
    const ia = labelA?.portfolio_impact?.estimated_impact_sek;
    const ic = labelC?.portfolio_impact?.estimated_impact_sek;
    rows.push({
      position: p.ticker,
      valueSek: v != null ? v.toLocaleString("sv-SE") : "—",
      impactScenarioA: ia != null && ia !== "" ? String(ia) : "— (narrative in L3 A)",
      impactScenarioC: ic != null && ic !== "" ? String(ic) : "— (narrative in L3 C)",
      action: "HOLD (verify) ✅",
    });
  }
  if (!rows.length) {
    for (const p of positions.slice(0, 4)) {
      const q = quotes[p.ticker] as Q | undefined;
      const v = q?.price_sek && p.quantity ? Math.round(q.price_sek * +p.quantity) : null;
      rows.push({
        position: p.ticker,
        valueSek: v != null ? v.toLocaleString("sv-SE") : "—",
        impactScenarioA: "— (no direct overlap in feed list)",
        impactScenarioC: "—",
        action: "Optional review",
      });
    }
  }
  const oBlocks: FeedLayer4["orders"] = [];
  for (const o of orders) {
    if (!inStory(o.ticker) && aff.length) continue;
    const last = (quotes[o.ticker] as Q | undefined)?.price_sek;
    const lim = o.limit_price != null ? +o.limit_price : NaN;
    const dist = last && !Number.isNaN(lim) && last > 0 ? (Math.abs(lim - last) / last) * 100 : NaN;
    oBlocks.push({
      summary: `Order: ${o.ticker} ${o.direction} @ ${o.limit_price}`,
      distanceLine: !Number.isNaN(dist) ? `Currently ${dist.toFixed(1)}% from mark (est.)` : "Mark unknown—refresh quotes from API",
      scenarioA: {
        situation: "Path that leans to fill (baseline leg)",
        rec: "If thesis still matches L2, keep; invalidation = your own rule, not the UI.",
      },
      scenarioC: {
        situation: "Path that gaps the limit / voids the setup (tail leg)",
        rec: "Cancel or re-place if a macro level you defined breaks (illustration only).",
      },
    });
  }
  const tickPool = (n.affected_tickers || []).filter(
    (t) => !positions.some((p) => norm(p.ticker) === norm(t as string)),
  );
  const watchlist = tickPool.slice(0, 5).map((tk) => ({
    line: `${String(tk)} — only as context after L2–3; not a buy list.`,
  }));
  const fm = t?.forward_model;
  return {
    positions: rows,
    orders: oBlocks,
    watchlist,
    isPersonalized: true,
    orderBookReview: parseOrderBookReview(fm),
    outsideDepotIdeas: parseOutsideDepotIdeas(fm),
  };
}

export function mapToFeedViewModel(
  n: NewsItem,
  tree: Tree | null | undefined,
  positions: Pos[],
  orders: Ord[],
  quotes: Record<string, Q>,
): FeedViewModel {
  const affected = n.affected_tickers || [];
  const userT = new Set(positions.map((p) => norm(p.ticker)));
  const affTags = (affected as string[]).map(norm).filter((t) => userT.has(t));
  const sl = Math.min(4, Math.max(1, n.signal_level)) as Sl;
  const hook = wordClip(n.one_line_summary || n.headline);
  const l2 = mergeLayer2Forward(tree, defaultLayer2(n, n.body_text));
  const l3: FeedLayer3 = fromTreeToLayer3(tree);
  let l4: FeedLayer4 | null = null;
  if (positions.length || orders.length) {
    l4 = buildLayer4(n, tree, positions, orders, quotes);
  } else {
    l4 = {
      positions: [],
      orders: [],
      watchlist: (affected as string[]).slice(0, 4).map((t) => ({
        line: `${t} — consider only after L2 context (illustration)`,
      })),
      isPersonalized: false,
      orderBookReview: parseOrderBookReview(tree?.forward_model),
      outsideDepotIdeas: parseOutsideDepotIdeas(tree?.forward_model),
    };
  }
  return {
    id: n.id,
    source: n.source || "Wire",
    signalLevel: sl,
    headline: n.headline,
    hook,
    affectedUserTags: affTags,
    layer2: l2,
    layer3: l3,
    layer4: l4,
    notificationText: hook,
    verification: parseVerification(n.raw_json),
  };
}
