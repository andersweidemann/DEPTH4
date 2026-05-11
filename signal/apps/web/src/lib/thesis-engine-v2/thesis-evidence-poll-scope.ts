import type { Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";

/**
 * User theses in these statuses are eligible for the same thesis_evidence_log / flow polling
 * as starred catalog theses — DEPTH4 cron writes evidence for any thesis row with insider_flow
 * + active-ish status; the client must poll those IDs or the UI stays stale.
 *
 * Excludes resolved/invalidated so we do not grow poll sets forever.
 */
const USER_THESIS_EVIDENCE_POLL_STATUSES = new Set<ThesisStatus>(["forming", "watching", "ready", "active"]);

/** Max thesis_ids per evidence / flow poll (PostgREST URL limits + cost). */
export const EVIDENCE_POLL_MAX_THESIS_IDS = 96;

/**
 * Build thesis_id list for `thesis_evidence_log` / `flow_anomalies` polling.
 * Priority: starred → open book → eligible user theses (session), capped.
 */
export function buildEvidencePollThesisIds(args: {
  starred: Iterable<string>;
  openIds: Iterable<string>;
  userTheses: Thesis[];
  maxTotal?: number;
}): string[] {
  const maxTotal = args.maxTotal ?? EVIDENCE_POLL_MAX_THESIS_IDS;
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    const s = id.trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  for (const id of Array.from(args.starred)) push(id);
  for (const id of Array.from(args.openIds)) push(id);

  for (const t of args.userTheses) {
    if (out.length >= maxTotal) break;
    if (!USER_THESIS_EVIDENCE_POLL_STATUSES.has(t.status)) continue;
    push(t.id);
  }

  return out.slice(0, maxTotal);
}
