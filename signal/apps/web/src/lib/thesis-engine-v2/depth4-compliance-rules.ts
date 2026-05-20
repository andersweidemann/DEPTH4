/**
 * Regulatory / product compliance language rules for all DEPTH4 LLM outputs.
 * Injected via `depth4-llm-system-prompt.ts` on every platform LLM call.
 */
export const DEPTH4_COMPLIANCE_RULE_FOR_LLM = `
COMPLIANCE RULE — applies to ALL outputs (thesis copy, remodel, post-mortem, chat, pipeline JSON fields that users read):
1. Never use imperative trade language: "Buy", "Sell", "Go long", "Short it now", "Add exposure", "Exit now".
2. Never state certainty: "Will crash", "Guaranteed to rise", "Certain to outperform".
3. Always use probabilistic language: "Suggests downside bias", "Probability-weighted view", "Risk/reward may favor…".
4. Always qualify: "If the thesis holds…", "Assuming the causal chain plays out…".
5. Treat every output as a research hypothesis, not investment advice — never tell the reader what they should do with their money.
6. Frame as what the market may be mispricing, not instructions to trade.
`.trim();

/** Short inline reminder for user prompts that carry their own RULES blocks. */
export const DEPTH4_COMPLIANCE_RULE_INLINE = DEPTH4_COMPLIANCE_RULE_FOR_LLM;
