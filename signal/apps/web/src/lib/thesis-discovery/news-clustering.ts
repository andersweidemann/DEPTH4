import { createHash } from "node:crypto";

/**
 * `public.news_events` columns used by Phase 2 (see `20240425120000_initial.sql`).
 * There is no ingest `created_at` / `inserted_at` column in the canonical schema; do not select it.
 *
 * Time semantics for clustering:
 * - **Ordering (DB fetch):** `signal_level` desc, then `published_at` desc, then `id` desc (stable tail).
 * - **Rolling window:** `effectiveEventMs(ev, nowMs)` = parsed `published_at` when set, else `nowMs`
 *   (cron run clock) so undated rows remain eligible inside `[now - window, now]` when they appear
 *   in the capped fetch.
 * - **Recency / title hint / sort within code:** same `effectiveEventMs` so null `published_at` does
 *   not drop events from the window or push them to epoch.
 */
export type NewsEventRow = {
  id: string;
  headline: string;
  body_text?: string | null;
  source?: string | null;
  published_at?: string | null;
  signal_level: number;
  category?: string | null;
  region?: string | null;
  affected_sectors?: unknown;
  affected_tickers?: unknown;
};

export type ClusteringOptions = {
  /** Rolling window in hours (default 24). */
  windowHours: number;
  /** Minimum Jaccard(token) overlap to merge an event into a cluster (0–1). */
  jaccardMerge: number;
  /** Minimum Jaccard when category + region both match (softer merge). */
  jaccardMergeSameTopic: number;
  /** Promotion: minimum distinct events in cluster. */
  minEventsForCandidate: number;
  /** Promotion: minimum `signal_score` (0–100 scale). */
  signalScoreThreshold: number;
};

const DEFAULT_OPTS: ClusteringOptions = {
  windowHours: Number(process.env.THESIS_DISCOVERY_WINDOW_HOURS ?? 24) || 24,
  jaccardMerge: Number(process.env.THESIS_DISCOVERY_JACCARD_MERGE ?? 0.32) || 0.32,
  jaccardMergeSameTopic: Number(process.env.THESIS_DISCOVERY_JACCARD_SAME_TOPIC ?? 0.14) || 0.14,
  minEventsForCandidate: Number(process.env.THESIS_DISCOVERY_MIN_EVENTS ?? 3) || 3,
  signalScoreThreshold: Number(process.env.THESIS_DISCOVERY_SIGNAL_THRESHOLD ?? 35) || 35,
};

const STOP = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "her",
  "was",
  "one",
  "our",
  "out",
  "day",
  "get",
  "has",
  "him",
  "his",
  "how",
  "its",
  "may",
  "new",
  "now",
  "old",
  "see",
  "two",
  "way",
  "who",
  "boy",
  "did",
  "she",
  "use",
  "her",
  "many",
  "than",
  "them",
  "these",
  "this",
  "that",
  "with",
  "from",
  "have",
  "been",
  "into",
  "more",
  "some",
  "time",
  "very",
  "when",
  "will",
  "your",
  "what",
  "which",
  "while",
  "about",
  "after",
  "before",
  "between",
  "could",
  "would",
  "should",
  "their",
  "there",
  "where",
  "being",
  "other",
  "such",
  "over",
  "also",
  "just",
  "like",
  "only",
  "even",
  "most",
  "much",
  "than",
  "then",
  "here",
  "said",
  "each",
  "both",
  "first",
  "last",
  "long",
  "made",
  "make",
  "well",
  "back",
  "year",
  "years",
  "week",
  "month",
  "today",
  "news",
  "says",
  "say",
]);

function normToken(w: string): string | null {
  const t = w.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (t.length < 3 || STOP.has(t)) return null;
  return t;
}

export function tokenizeHeadline(headline: string, bodySnippet: string): Set<string> {
  const raw = `${headline} ${bodySnippet}`.toLowerCase();
  const parts = raw.split(/[^a-z0-9]+/g);
  const out = new Set<string>();
  for (const p of parts) {
    const n = normToken(p);
    if (n) out.add(n);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of Array.from(a)) {
    if (b.has(x)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

function tickersFromEvent(ev: NewsEventRow): Set<string> {
  const t = asStringArray(ev.affected_tickers)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length >= 2 && s.length <= 12);
  return new Set(t);
}

function sectorsFromEvent(ev: NewsEventRow): Set<string> {
  return new Set(
    asStringArray(ev.affected_sectors)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Monotonic-ish instant for windowing and sorting; see file header for `published_at` null rules. */
function effectiveEventMs(ev: NewsEventRow, nowMs: number): number {
  const p = ev.published_at ? Date.parse(ev.published_at) : NaN;
  if (Number.isFinite(p)) return p;
  return nowMs;
}

export type NarrativeCluster = {
  memberIds: string[];
  events: NewsEventRow[];
  tokenUnion: Set<string>;
  tickers: Set<string>;
  sectors: Set<string>;
  categories: Set<string>;
  regions: Set<string>;
  titleHint: string;
  signalScore: number;
  passesPromotionGate: boolean;
  fingerprint: string;
  metadata: Record<string, unknown>;
};

function fingerprintForSortedIds(ids: string[]): string {
  const sorted = [...ids].sort();
  return createHash("sha256").update(sorted.join(",")).digest("hex");
}

function computeSignalScore(events: NewsEventRow[], nowMs: number): number {
  if (!events.length) return 0;
  const n = events.length;
  const avgSig = events.reduce((s, e) => s + Math.min(4, Math.max(1, e.signal_level || 1)), 0) / n / 4;
  const sources = new Set(events.map((e) => (e.source ?? "").trim()).filter(Boolean)).size;
  const newest = Math.max(...events.map((e) => effectiveEventMs(e, nowMs)));
  const ageH = (nowMs - newest) / 3_600_000;
  const recency = ageH <= 6 ? 1 : ageH <= 12 ? 0.85 : ageH <= 24 ? 0.65 : 0.45;

  const countPart = Math.min(45, n * 9);
  const signalPart = avgSig * 35;
  const diversityPart = Math.min(15, sources * 4);
  const recencyPart = recency * 5;
  return Math.round(Math.min(100, countPart + signalPart + diversityPart + recencyPart));
}

function titleHintFrom(events: NewsEventRow[], nowMs: number): string {
  const sorted = [...events].sort((a, b) => effectiveEventMs(b, nowMs) - effectiveEventMs(a, nowMs));
  const h = sorted[0]?.headline?.trim() || "Emerging narrative";
  return h.length > 160 ? `${h.slice(0, 157)}…` : h;
}

function shouldAttachEvent(ev: NewsEventRow, c: NarrativeCluster, o: ClusteringOptions): boolean {
  const evTokens = tokenizeHeadline(ev.headline, (ev.body_text ?? "").slice(0, 280));
  const evTick = tickersFromEvent(ev);
  const evCat = (ev.category ?? "").trim().toLowerCase();
  const evReg = (ev.region ?? "").trim().toLowerCase();

  const jac = jaccard(evTokens, c.tokenUnion);
  if (jac >= o.jaccardMerge) return true;

  let sharedTick = false;
  for (const t of Array.from(evTick)) {
    if (c.tickers.has(t)) {
      sharedTick = true;
      break;
    }
  }
  if (sharedTick && jac >= o.jaccardMergeSameTopic) return true;

  if (evCat && evReg) {
    let topicHit = false;
    for (const cc of Array.from(c.categories)) {
      if (cc && cc === evCat) {
        topicHit = true;
        break;
      }
    }
    if (topicHit) {
      for (const rr of Array.from(c.regions)) {
        if (rr && rr === evReg && jac >= o.jaccardMergeSameTopic) return true;
      }
    }
  }

  return false;
}

function addEventToCluster(c: NarrativeCluster, ev: NewsEventRow): void {
  c.events.push(ev);
  c.memberIds.push(ev.id);
  const evTokens = tokenizeHeadline(ev.headline, (ev.body_text ?? "").slice(0, 280));
  for (const t of Array.from(evTokens)) c.tokenUnion.add(t);
  for (const t of Array.from(tickersFromEvent(ev))) c.tickers.add(t);
  for (const s of Array.from(sectorsFromEvent(ev))) c.sectors.add(s);
  const cat = (ev.category ?? "").trim().toLowerCase();
  const reg = (ev.region ?? "").trim().toLowerCase();
  if (cat) c.categories.add(cat);
  if (reg) c.regions.add(reg);
}

function newClusterFromEvent(ev: NewsEventRow): NarrativeCluster {
  const tokenUnion = tokenizeHeadline(ev.headline, (ev.body_text ?? "").slice(0, 280));
  const tickers = tickersFromEvent(ev);
  const sectors = sectorsFromEvent(ev);
  const categories = new Set<string>();
  const regions = new Set<string>();
  const cat = (ev.category ?? "").trim().toLowerCase();
  const reg = (ev.region ?? "").trim().toLowerCase();
  if (cat) categories.add(cat);
  if (reg) regions.add(reg);
  return {
    memberIds: [ev.id],
    events: [ev],
    tokenUnion,
    tickers,
    sectors,
    categories,
    regions,
    titleHint: "",
    signalScore: 0,
    passesPromotionGate: false,
    fingerprint: "",
    metadata: {},
  };
}

function finalizeCluster(c: NarrativeCluster, nowMs: number, o: ClusteringOptions): NarrativeCluster {
  c.memberIds = Array.from(new Set(c.memberIds));
  c.events = Array.from(new Map(c.events.map((e) => [e.id, e])).values());
  c.titleHint = titleHintFrom(c.events, nowMs);
  c.signalScore = computeSignalScore(c.events, nowMs);
  c.fingerprint = fingerprintForSortedIds(c.memberIds);
  c.passesPromotionGate =
    c.events.length >= o.minEventsForCandidate && c.signalScore >= o.signalScoreThreshold;
  c.metadata = {
    fingerprint: c.fingerprint,
    distinct_events: c.events.length,
    distinct_sources: new Set(c.events.map((e) => (e.source ?? "").trim()).filter(Boolean)).size,
    categories: Array.from(c.categories),
    regions: Array.from(c.regions),
    tickers: Array.from(c.tickers).slice(0, 40),
    token_sample: Array.from(c.tokenUnion).slice(0, 40),
    window_hours: o.windowHours,
    clustered_at: new Date(nowMs).toISOString(),
  };
  return c;
}

/**
 * Greedy narrative clustering over a pre-filtered event list (same time window).
 * Returns finalized clusters with `passesPromotionGate` for DB writes (Phase 2 writes candidates only).
 */
export function clusterNewsEvents(events: NewsEventRow[], nowMs: number, opts?: Partial<ClusteringOptions>): NarrativeCluster[] {
  const o = { ...DEFAULT_OPTS, ...opts };
  const sorted = [...events].sort((a, b) => {
    const sb = Math.min(4, Math.max(1, b.signal_level || 1)) - Math.min(4, Math.max(1, a.signal_level || 1));
    if (sb !== 0) return sb;
    return effectiveEventMs(b, nowMs) - effectiveEventMs(a, nowMs);
  });

  const clusters: NarrativeCluster[] = [];
  for (const ev of sorted) {
    let placed = false;
    for (const c of clusters) {
      if (shouldAttachEvent(ev, c, o)) {
        addEventToCluster(c, ev);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push(newClusterFromEvent(ev));
  }

  return clusters.map((c) => finalizeCluster(c, nowMs, o));
}

export function filterEventsInWindow(events: NewsEventRow[], nowMs: number, windowHours: number): NewsEventRow[] {
  const start = nowMs - windowHours * 3_600_000;
  return events.filter((e) => {
    const t = effectiveEventMs(e, nowMs);
    return t >= start && t <= nowMs;
  });
}

export function getDefaultClusteringOptions(): ClusteringOptions {
  return { ...DEFAULT_OPTS };
}
