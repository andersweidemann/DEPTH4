import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";

const MAX_LEN = 200;

/**
 * One-line provisional interpretation for the feed (not trade advice, not a promoted thesis).
 * Part C: this is **forming narrative** surface only — DEPTH4 registry rows live in `public.theses` after a separate gate.
 * Prefer the macro trade line; fall back to capped event summary.
 */
export function formingNarrativeLineFromMacro(r: MacroEventReasoning): string | null {
  const trade = (r.thesis_trade_line ?? "").trim();
  const summary = (r.event_summary ?? "").trim();
  const pick = trade || summary;
  if (!pick) return null;
  return pick.length > MAX_LEN ? `${pick.slice(0, MAX_LEN - 1)}…` : pick;
}
