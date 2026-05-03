/** Classification prompt — mirrors FastAPI `signal_api/ai/prompts.py` */

export const CLASSIFY_SYSTEM = `You are DEPTH4 — a geopolitical macro analyst. Return structured JSON only. No markdown, no backticks.
NON-NEGOTIABLE: Headline and body are the ONLY evidence. Do not invent dates or breaking claims not in that text. If recency cannot be verified from the text, set verification.status to "unconfirmed" and flag_for_user starting with "⚠️ UNCONFIRMED — ".`;

export function buildClassifyUserPrompt(headline: string, body: string) {
  return `Classify this news item:
Headline: ${headline}
Body: ${body}

Return JSON with these fields:
- signal_level: integer 1-4 where 1=background noise, 2=relevant context, 3=market moving, 4=breaking/critical
- category: one of [geopolitical, macro, earnings, central_bank, commodity, sanctions, conflict, trade, other]
- region: one of [MENA, Europe, US, Asia, LatAm, Global]
- urgency: one of [breaking, developing, background]
- affected_sectors: array of strings from [energy, defense, agriculture, financials, tech, industrials, healthcare, materials, utilities]
- affected_tickers: array of ticker symbols most likely impacted, both direct and second-order effects
- one_line_summary: maximum 15 words, no hedging language
- reasoning: 2 sentences explaining the classification
- opportunity_tickers: array of US-listed second-order tickers (0-6), or []
- theme_tags: 0-3 short tags
- verification: REQUIRED object: status "confirmed"|"unconfirmed", basis (one sentence), last_known_date_hint (YYYY-MM-DD or null), flag_for_user (null or "⚠️ UNCONFIRMED — …")`;
}

export const CONSEQUENCE_SYSTEM = `You are DEPTH4. Use the word Depth (Depth 1–4), never "Level". Target any Depth where priced_in is not fully baked in. Only facts from the supplied headline/body; do not invent overnight developments. Return JSON only, no markdown.`;

export function buildConsequenceUserPrompt(
  event: { headline: string; body: string; sectors: string[]; tickers: string[] },
  portfolio: unknown,
  orders: unknown
) {
  return `Generate a consequence tree for this event.

Event: ${event.headline}
Context: ${event.body}
Affected sectors: ${JSON.stringify(event.sectors)}
Affected tickers: ${JSON.stringify(event.tickers)}

User portfolio: ${JSON.stringify(portfolio)}
User open orders: ${JSON.stringify(orders)}

Required:
- transmission_chain: exactly 4 objects (Depth 1–4; field "step" 1-4). Each: from_state, mechanism, to_state, time_to_effect, lead_indicator (optional), priced_in (not_priced_in|partial|priced_in), stock_ideas [{ticker,rationale}] 0-3, buy_trigger.
- early_lead_indicators: 3-5 of { "text", "light": "green"|"yellow"|"red" }
- forward_horizon_summary: one sentence
- order_book_review: REQUIRED array, one object per open order (or [] if none): {ticker, direction, limit_price, stance: hold|tighten|cancel|watch|add_risk, rationale}
- outside_depot_ideas: REQUIRED array, 1-3 objects: {ticker, side: long|short, rationale, linked_depth: 1-4, why_outside_book} — ideas not already in portfolio; each tied to an under-priced Depth.

Plus: event_summary, signal_level, scenarios (2-4 with label, probability, outcome, market_impact, winners, losers, portfolio_impact, order_recommendations), watch_signals.`;
}

export const BRIEFING_SYSTEM = `You are DEPTH4 writing a morning briefing. Be direct. Only state as fact what the supplied event summaries support; otherwise label ⚠️ UNCONFIRMED. Output valid markdown.`;

export function buildBriefingUserPrompt(
  dateStr: string,
  context: { events: unknown; portfolio: unknown; orders: unknown; trees: unknown }
) {
  return `Generate a morning briefing for ${dateStr}.

Recent events (last 18 hours): ${JSON.stringify(context.events)}
User portfolio: ${JSON.stringify(context.portfolio)}
User open orders: ${JSON.stringify(context.orders)}
Recent consequence trees: ${JSON.stringify(context.trees)}

Structure the briefing as markdown with:
## Overnight
3-5 bullet points.

## Watch today
Exactly 3 items with one sentence each (portfolio-specific why).

## Your portfolio
Risks and benefits; be specific on SEK where possible.

## Order book
One sentence per open order: stay, move, or cancel.

## Key times today
Calendar: earnings, CB, geopolitics, market times.`;
}

/** Strip JSON from possible markdown fences from LLM */
export function parseJsonObject<T>(raw: string): T {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return JSON.parse(s) as T;
}
