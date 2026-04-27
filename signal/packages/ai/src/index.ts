/** Classification prompt — mirrors FastAPI `signal_api/ai/prompts.py` */

export const CLASSIFY_SYSTEM = `You are a senior macro analyst. Classify this news item and return structured JSON only. No markdown, no backticks.`;

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
- reasoning: 2 sentences explaining the classification`;
}

export const CONSEQUENCE_SYSTEM = `You are a senior macro analyst. Be direct, opinionated, and specific. Plain language. Each transmission_chain step must include: priced_in (not_priced_in|partial|priced_in), stock_ideas [{ticker, rationale}] (0-3, illustration not advice), buy_trigger; plus early_lead_indicators, forward_horizon_summary. Return JSON only, no markdown.`;

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

Required shape: transmission_chain (4 objects, include priced_in, stock_ideas, buy_trigger per above), early_lead_indicators (3-5 of { "text", "light" }), forward_horizon_summary, plus:
{
  "event_summary": "one sentence, max 15 words",
  "signal_level": 1-4,
  "scenarios": [ ... ],
  "watch_signals": [ "string" ]
}
Each scenario: label, probability, outcome, market_impact (object of key strings), winners, losers, portfolio_impact, order_recommendations as in product spec.`;
}

export const BRIEFING_SYSTEM = `You are a macro analyst writing a morning briefing for a trader. Write like a smart friend who is also a senior portfolio manager. Be direct. Be opinionated. No filler. Conversational tone. No hedging. If you think something is a buy, say so. Output valid markdown.`;

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
