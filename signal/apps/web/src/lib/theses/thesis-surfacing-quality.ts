/**
 * Minimum bar for assigning `surfaced_bucket` (Emerging / Monitoring / Tradable) on the Theses home lanes.
 *
 * **Insert path:** new `ai_generated` rows are only created when `ensureAiThesisForDiscoveryCluster` accepts the
 * cluster output (DEPTH4 **registry** pack: {@link passesAiThesisRegistryInsertValidation} + hero base bar). Legacy DB
 * rows from older pipelines may still exist; they stay off home buckets until copy matures.
 *
 * {@link isThesisMapListableThesis} is the **public thesis map** gate (`/theses`): catalog always passes; other rows
 * must look like causal forecasts, not pasted news or event titles.
 */
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { isCatalogThesisId } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { getThesisDisplayModel } from "@/lib/thesis-engine-v2/thesis-display-selectors";

const AI_SHELL_PLACEHOLDER = "This thesis was formed from analyzed news";

/** Strong signals the hero line is still a source artifact, not a DEPTH4 thesis. */
const RAW_SOURCE_TITLE_PATTERNS: RegExp[] = [
  /\bearnings\s+call\b/i,
  /\btranscript\b/i,
  /\bprepared\s+remarks\b/i,
  /\bshareholder\s*\/\s*analyst\s+call\b/i,
  /\banalyst\s+call\b/i,
  /\bconference\s+call\b/i,
  /\bwebcast\b/i,
  /\bQ[1-4]\s+20\d{2}\s+earnings\b/i,
  /\bearnings\s+call\s+transcript\b/i,
  /\bremarks\s+transcript\b/i,
  /\bslideshow\b/i,
  /\bpresents\s+at\b/i,
  /\bone[-‑]on[-‑]one\b/i,
  /\bresults\s*[-–]\s*earnings\s+call\s+presentation\b/i,
  /\bearnings\s+presentation\b/i,
  /\bshareholder\s+call\b/i,
  /\b(analyst|investor)\s+day\b/i,
  // IR / sell-side one-liners and “headline thesis” shells (see VISION.md — not tradable DEPTH4 heroes).
  /\bFair Value\b/i,
  /\bNear Fair Value\b/i,
  /\bLong-Term Targets\b/i,
  /\bPT raised\b/i,
  /\bprice target\b/i,
  /\bGood Earnings\b/i,
  /\bStrong Earnings\b/i,
  /\bEarnings Beat\b/i,
  /\bEarnings And Growth\b/i,
  /\bAggressive Campaign\b/i,
  /\bWe May Be Going\b/i,
  /\bShares Near\b/i,
];

const FORWARD_LOOKING_CUES =
  /\b(will|should|likely\s+to|expects?|implies?|repric|mispric|rerat|re-?rate|stay\s+bid|stay\s+under|find\s+a\s+floor|fade|underperform|outperform|squeeze|peak|trough|overbought|oversold|risk\s+is|discount\s+to|premium\s+to|until\s+when|before\s+revenue|before\s+earnings|if\s+.{8,}|when\s+.{8,}|rally|rallies|selloff|sell\s+off|unwind|grind(?:s|ing)?|spike|dips?|breaks?|rebound|surge|tighten|widen|slump|recover|chop)\b/i;

/**
 * Gate for **persisting** a new `ai_generated` row in `public.theses`: hero must not be ingest/transcript copy and
 * must read as a **forward** market view. Length alone is not enough — long IR headlines used to bypass this
 * (see polluted `ai_generated` titles in prod); registry rows must match `VISION.md` non‑negotiables.
 */
export function isAcceptableAiThesisRegistryHero(s: string): boolean {
  const t = s.trim();
  if (!t || t.length < 18) return false;
  if (/^ai[- ]discovered thesis$/i.test(t)) return false;
  if (titleLooksLikeRawSourceMaterial(t)) return false;
  const forward = FORWARD_LOOKING_CUES.test(t);
  if (!forward) return false;
  return true;
}

export function titleLooksLikeRawSourceMaterial(text: string): boolean {
  const s = text.trim();
  if (!s) return true;
  /** Very short strings are usually incomplete; allow punchy tickers (e.g. "BTC is overbought.") above this floor. */
  if (s.length < 10) return true;
  for (const re of RAW_SOURCE_TITLE_PATTERNS) {
    if (re.test(s)) return true;
  }
  return false;
}

function narrativeHasNonPlaceholderSubstance(t: Thesis): boolean {
  const signalFields = [t.whyNow, t.whatsUnpriced, t.trigger, t.trade, t.invalidation, t.oneLineSummary].map((x) =>
    typeof x === "string" ? x.trim() : "",
  );
  const combined = signalFields.filter(Boolean).join(" ").trim();
  const hero = `${(t.title || "").trim()} ${(t.thesisStatement || "").trim()}`.trim();
  if (combined.includes(AI_SHELL_PLACEHOLDER)) return false;
  const genericSee = /^see (linked news cluster|macro scan)\.?$/i;
  if (genericSee.test((t.whyNow ?? "").trim()) && (t.whatsUnpriced ?? "").trim().length < 30) return false;
  if (combined.length >= 48) return true;
  /** Thin evidence blocks are OK when the hero is already a clear forward market view (common on user / AI rows). */
  if (FORWARD_LOOKING_CUES.test(hero) && hero.length >= 18) return true;
  return false;
}

/**
 * True only when the row reads like a forward-looking, market-facing thesis — not a transcript title or bare cluster headline.
 */
export function passesDepth4ThesisSurfacingQualityBar(t: Thesis): boolean {
  const title = (t.title || "").trim();
  const statement = (t.thesisStatement || "").trim();
  if (!title || !statement) return false;

  if (titleLooksLikeRawSourceMaterial(title)) return false;
  if (statement !== title && titleLooksLikeRawSourceMaterial(statement)) return false;

  if (/^ai[- ]discovered thesis$/i.test(title)) return false;

  const forwardInHero = FORWARD_LOOKING_CUES.test(statement) || FORWARD_LOOKING_CUES.test(title);
  const longAnalyticalHero = statement.length >= 96;

  if (!forwardInHero && !longAnalyticalHero) return false;

  if (!narrativeHasNonPlaceholderSubstance(t)) return false;

  return true;
}

/**
 * `/theses` map: only **promoted causal theses** — not raw headlines, conference decks, or shallow rejected
 * narratives (those never get `ai_generated` rows). Catalog rows always list (seeded product surface).
 *
 * **`ai_generated`:** registry insert already ran the DEPTH4 pack; seed `scenario_probabilities` stay template-shaped
 * until evidence / cron moves them — do not hide forming/watching AI rows for that alone.
 */
export function isThesisMapListableThesis(t: Thesis): boolean {
  if (isCatalogThesisId(t.id)) return true;
  if (!passesDepth4ThesisSurfacingQualityBar(t)) return false;

  const title = (t.title || "").trim();
  if (title.length > 220) return false;

  const dm = getThesisDisplayModel(t);
  if (dm.convictionIsTemplateEstimate && (t.status === "forming" || t.status === "watching")) {
    if (t.thesisOrigin === "ai_generated") return true;
    // User-owned drafts belong on the map (Emerging bucket) once they pass the quality bar above.
    if (t.thesisOrigin === "user") return true;
    return false;
  }

  return true;
}

/**
 * Pick the best primary statement for a new `ai_generated` row — prefer thesis_trade_line, then event_summary.
 * Cluster title_hint is never used here (ingest prose); callers may still pass it for API symmetry.
 */
export function pickAiThesisStatementFromReasoning(p: {
  titleHint: string | null;
  thesisTradeLine: string;
  eventSummary: string;
}): string {
  void p.titleHint;
  const trade = (p.thesisTradeLine ?? "").trim();
  const summary = (p.eventSummary ?? "").trim();

  /** Same bar as DB insert: no ingest copy, no thin event blurbs without a forward market view. */
  const prefer = (s: string) => isAcceptableAiThesisRegistryHero(s);

  if (prefer(trade)) return trade.slice(0, 480);
  if (prefer(summary)) return summary.slice(0, 480);
  /** Cluster title_hint is ingest/cluster prose — never use as registry hero (VISION.md). */
  return "";
}
