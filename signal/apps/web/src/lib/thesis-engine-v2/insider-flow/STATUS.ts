/** Insider-flow pipeline implementation snapshot (admin diagnostics). */
export const INSIDER_FLOW_IMPLEMENTATION_STATUS = {
  state: "PARTIALLY_IMPLEMENTED" as const,
  codeExists: true,
  cronRoutes: ["/api/cron/insider-flow", "/api/cron/insider-flow-baselines"] as const,
  evidenceLog: "thesis_evidence_log",
  marketData:
    "Uses Twelve Data batch quotes when TWELVE_DATA_API_KEY is set; otherwise mock-market snapshots for detection.",
  notes:
    "Detection + DB writes are live; headline confirmation and push prefs vary by environment. Not a full production market stack without API key.",
} as const;

export function insiderFlowStatusLine(): string {
  const s = INSIDER_FLOW_IMPLEMENTATION_STATUS;
  return `${s.state} · cron: ${s.cronRoutes.join(", ")} · writes ${s.evidenceLog}`;
}
