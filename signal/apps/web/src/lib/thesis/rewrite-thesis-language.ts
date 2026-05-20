import { completeCheapAnthropicJson } from "@/lib/ai/thesis-pipeline-llm";
import { textLikelyNeedsComplianceRewrite } from "@/lib/thesis/thesis-language-compliance-audit";

const REWRITE_MAX_TOKENS = 1024;

const REWRITE_TASK_EXTRA = `
You are a compliance editor for DEPTH4 macro research copy.
Rewrite the user's text to comply with DEPTH4 language rules.

RULES:
1. NEVER use imperatives: "Buy", "Sell", "Go long", "Short it now", "Initiate a position".
2. NEVER state certainty: "Will crash", "Guaranteed to rise", "Definitely fall".
3. ALWAYS use probabilistic language: "Suggests downside bias", "Risk/reward may favor…", "Market appears to be underpricing…".
4. ALWAYS qualify: "If the thesis holds…", "Assuming the causal chain plays out…".
5. Frame as research, not advice — never tell the reader what to do with their money.
6. Preserve tickers, levels, horizons, and causal claims; only change tone and framing.
7. Keep similar length (±30%). Do not add markdown.

Return strict JSON only: {"rewritten": string}
`.trim();

function parseRewrittenPayload(raw: unknown): string | null {
  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length > 0 ? t : null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const rewritten = r.rewritten ?? r.text ?? r.output;
  if (typeof rewritten !== "string") return null;
  const t = rewritten.trim();
  return t.length > 0 ? t : null;
}

function buildRewriteUserPrompt(text: string): string {
  return [
    REWRITE_TASK_EXTRA,
    "",
    "EXAMPLES:",
    'Before: "We are initiating a short position in WTI crude oil based on an underpriced de-escalation scenario."',
    'After: "This thesis suggests WTI crude oil may be overpricing geopolitical risk, creating a potential downside bias if de-escalation progresses."',
    "",
    'Before: "Buy gold at $2,300 with a target of $2,500."',
    'After: "The analysis identifies a potential mispricing in gold, with upside bias toward $2,500 should the de-escalation thesis hold."',
    "",
    "REWRITE this text (JSON-escaped in the next line):",
    JSON.stringify(text),
  ].join("\n");
}

/**
 * Rewrite a single prose field to probabilistic / research framing.
 * Returns original text when LLM is unavailable or copy already passes heuristics.
 */
export async function rewriteThesisLanguage(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 8) return text;
  if (!textLikelyNeedsComplianceRewrite(trimmed)) return text;

  const raw = await completeCheapAnthropicJson(buildRewriteUserPrompt(trimmed), REWRITE_MAX_TOKENS);
  const rewritten = parseRewrittenPayload(raw);
  if (!rewritten || rewritten === trimmed) return text;
  return rewritten;
}
