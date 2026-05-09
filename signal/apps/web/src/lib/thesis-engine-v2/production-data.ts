/**
 * DEPTH4 production data guardrails
 *
 * Checklist for contributors (signed-in app surfaces):
 * - Do not hardcode market prices, indices, or FX levels as if they were live.
 * - Do not show mock/sample probabilities, statuses, or “live” banner copy unless
 *   `NEXT_PUBLIC_THESIS_MOCK_TICKS === "1"` (local demo only).
 * - Prefer empty states (“Not live yet”, “No data”) over plausible-looking fake numbers.
 * - Header counts (ready/active/total) must come from the same source as the page table,
 *   or use `thesesLiveHeaderNeutral()` until that wiring exists.
 * - Thesis copy (titles, narratives): follow `.cursor/rules/depth4-thesis-narrative-writing.mdc`
 *   — six checks (position, event, cause, when, L1–L4 cascade, mispricing); time-bound inside ~6 months; no model/LLM wording.
 */

/** Local-only mock probability ticks + mock ticker stream (never enable in production). */
export function thesisMockTicksEnabled(): boolean {
  return process.env.NEXT_PUBLIC_THESIS_MOCK_TICKS === "1";
}
