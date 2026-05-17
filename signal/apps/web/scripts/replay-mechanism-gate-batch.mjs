/**
 * Batch-replay evaluateThesisEventMechanismGate (stdin JSON array → stdout JSON).
 * Used by tools/depth4-thesis-review/mechanism_gate_audit.py
 */
import { readFileSync } from "node:fs";
import { evaluateThesisEventMechanismGate } from "../src/lib/thesis-engine-v2/thesis-event-mechanism-gate.ts";

const raw = readFileSync(0, "utf8");
const rows = JSON.parse(raw);

const out = rows.map((row) => {
  const gate = evaluateThesisEventMechanismGate({
    thesis: row.thesis,
    event: row.event,
    match: row.match,
  });
  return {
    evidence_id: row.evidence_id,
    thesis_id: row.thesis_id,
    prod_gate: row.prod_gate,
    prod_block: row.prod_block,
    allowed: gate.allowed,
    logOnly: gate.logOnly,
    blockCode: gate.blockCode,
    blockDetail: gate.blockDetail,
    mechanismReason: gate.mechanismReason,
    assetFamily: gate.assetFamily,
    mechanismSignals: gate.mechanismSignals,
  };
});

process.stdout.write(JSON.stringify(out));
