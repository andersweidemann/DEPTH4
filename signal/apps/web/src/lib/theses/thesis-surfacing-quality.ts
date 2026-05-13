/**
 * Minimum bar for assigning `surfaced_bucket` (Emerging / Monitoring / Tradable) on the Theses home lanes.
 * Registry rows (`ai_generated` in DB) may still exist without passing — they stay off home buckets until copy matures.
 */
import type { Thesis } from "@/lib/thesis-engine-v2/types";

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
];

const FORWARD_LOOKING_CUES =
  /\b(will|should|likely\s+to|expects?|implies?|repric|mispric|underperform|outperform|squeeze|peak|trough|risk\s+is|discount\s+to|premium\s+to|until\s+when|before\s+revenue|before\s+earnings|if\s+.{8,}|when\s+.{8,})\b/i;

export function titleLooksLikeRawSourceMaterial(text: string): boolean {
  const s = text.trim();
  if (!s) return true;
  if (s.length < 24) return true;
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
  if (combined.length < 48) return false;
  if (combined.includes(AI_SHELL_PLACEHOLDER)) return false;
  const genericSee = /^see (linked news cluster|macro scan)\.?$/i;
  if (genericSee.test((t.whyNow ?? "").trim()) && (t.whatsUnpriced ?? "").trim().length < 30) return false;
  return true;
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
 * Pick the best primary statement for a new `ai_generated` row — prefer trade line / summary over cluster title hints.
 */
export function pickAiThesisStatementFromReasoning(p: {
  titleHint: string | null;
  thesisTradeLine: string;
  eventSummary: string;
}): string {
  const hint = (p.titleHint ?? "").trim();
  const trade = (p.thesisTradeLine ?? "").trim();
  const summary = (p.eventSummary ?? "").trim();

  const prefer = (s: string) => s && !titleLooksLikeRawSourceMaterial(s);

  if (prefer(trade)) return trade.slice(0, 480);
  if (prefer(summary)) return summary.slice(0, 480);
  if (prefer(hint)) return hint.slice(0, 480);

  if (trade) return trade.slice(0, 480);
  if (summary) return summary.slice(0, 480);
  if (hint && !titleLooksLikeRawSourceMaterial(hint)) return hint.slice(0, 480);

  return "AI-discovered thesis";
}
