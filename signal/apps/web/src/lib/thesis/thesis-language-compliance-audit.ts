/** Heuristic audit for imperative / certainty language in thesis copy (pre-rewrite scan). */

export type ComplianceViolationKind = "imperative" | "certainty" | "recommendation";

export type ComplianceViolation = {
  kind: ComplianceViolationKind;
  pattern: string;
  match: string;
};

const IMPERATIVE_PATTERNS: Array<{ kind: ComplianceViolationKind; re: RegExp; label: string }> = [
  { kind: "imperative", re: /\bwe are initiating\b/i, label: "we_are_initiating" },
  { kind: "imperative", re: /\b(initiating|initiate)\s+(a\s+)?(short|long)\s+position\b/i, label: "initiate_position" },
  { kind: "imperative", re: /\b(go|get)\s+long\b/i, label: "go_long" },
  { kind: "imperative", re: /\b(go|get)\s+short\b/i, label: "go_short" },
  { kind: "imperative", re: /\bshort\s+it\s+now\b/i, label: "short_it_now" },
  { kind: "imperative", re: /\badd\s+exposure\b/i, label: "add_exposure" },
  { kind: "imperative", re: /\bexit\s+now\b/i, label: "exit_now" },
  { kind: "recommendation", re: /\bbuy\s+(at|into|gold|silver|wti|crude|oil|tlt|qqq|spy|dax|eur|usd)\b/i, label: "buy_asset" },
  { kind: "recommendation", re: /\bsell\s+(at|into|gold|silver|wti|crude|oil)\b/i, label: "sell_asset" },
  { kind: "recommendation", re: /\bbuy\s+at\s+\$/i, label: "buy_at_price" },
];

const CERTAINTY_PATTERNS: Array<{ kind: ComplianceViolationKind; re: RegExp; label: string }> = [
  { kind: "certainty", re: /\bwill\s+crash\b/i, label: "will_crash" },
  { kind: "certainty", re: /\bwill\s+(rise|fall|rally|selloff|outperform|underperform)\b/i, label: "will_move" },
  { kind: "certainty", re: /\b(guaranteed|definitely|certain\s+to)\b/i, label: "guaranteed" },
  { kind: "certainty", re: /\bthe\s+fed\s+will\b/i, label: "fed_will" },
];

export function findComplianceViolations(text: string): ComplianceViolation[] {
  const t = text.trim();
  if (!t) return [];
  const out: ComplianceViolation[] = [];
  for (const p of [...IMPERATIVE_PATTERNS, ...CERTAINTY_PATTERNS]) {
    const m = t.match(p.re);
    if (m?.[0]) {
      out.push({ kind: p.kind, pattern: p.label, match: m[0] });
    }
  }
  return out;
}

export function textLikelyNeedsComplianceRewrite(text: string): boolean {
  return findComplianceViolations(text).length > 0;
}
