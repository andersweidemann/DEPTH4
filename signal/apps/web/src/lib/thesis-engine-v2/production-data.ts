/**
 * DEPTH4 production data guardrails
 *
 * Checklist for contributors (signed-in app surfaces):
 * - Do not hardcode market prices, indices, or FX levels as if they were live.
 * - Do not show mock/sample probabilities, statuses, or “live” banner copy unless
 *   backed by real queries or evidence — prefer empty states (“Not live yet”, “No data”).
 * - Prefer empty states over plausible-looking fake numbers.
 * - Header counts (ready/active/total) must come from the same source as the page table,
 *   or use `thesesLiveHeaderNeutral()` until that wiring exists.
 * - Thesis copy (titles, narratives): follow `.cursor/rules/depth4-thesis-narrative-writing.mdc`
 *   — explicit actions (Buy/Sell/Don’t add…); optional `oneLineSummary` (~3s hook); optional `thesisCascade`; optional `timeStop`; time-bound; no model/LLM wording.
 */
