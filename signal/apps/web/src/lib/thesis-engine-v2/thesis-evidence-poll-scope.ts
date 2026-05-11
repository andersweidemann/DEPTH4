import type { Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";
import { CURATED_FOCUS_CATALOG_ORDER } from "@/lib/thesis-engine-v2/curated-focus-theses";

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

/** Rows fetched per poll — must be large enough that low-volume theses are not starved by busy catalog IDs. */
export const EVIDENCE_LOG_POLL_ROW_LIMIT = 480;

/**
 * Build thesis_id list for `thesis_evidence_log` / `flow_anomalies` polling.
 * Priority: **detail-page focus** (if any) → starred → open book → curated focus catalog (macro map) →
 * eligible user theses (session), capped. Catalog IDs are included so promoted macro / news evidence reaches
 * `/theses` without requiring every row to be starred.
 */
export function buildEvidencePollThesisIds(args: {
  starred: Iterable<string>;
  openIds: Iterable<string>;
  userTheses: Thesis[];
  /** e.g. thesis open in drawer/detail — always polled first so evidence timeline is not dropped under global row caps. */
  priorityIds?: Iterable<string>;
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

  if (args.priorityIds) {
    for (const id of Array.from(args.priorityIds)) push(id);
  }
  for (const id of Array.from(args.starred)) push(id);
  for (const id of Array.from(args.openIds)) push(id);

  for (const id of CURATED_FOCUS_CATALOG_ORDER) {
    if (out.length >= maxTotal) break;
    push(id);
  }

  for (const t of args.userTheses) {
    if (out.length >= maxTotal) break;
    if (!USER_THESIS_EVIDENCE_POLL_STATUSES.has(t.status)) continue;
    push(t.id);
  }

  return out.slice(0, maxTotal);
}

/** IDs for user theses that participate in evidence polling (same status gate as `buildEvidencePollThesisIds`). */
export function collectEligibleUserThesisPollIdSet(userTheses: Thesis[]): Set<string> {
  const s = new Set<string>();
  for (const t of userTheses) {
    if (USER_THESIS_EVIDENCE_POLL_STATUSES.has(t.status)) s.add(t.id);
  }
  return s;
}

/**
 * Bell / toast eligibility for *new* evidence rows. Scenario overrides apply to all polled theses;
 * notifications stay scoped to followed catalog (star/book) plus eligible user theses the owner has in-session.
 */
export function isFreshEvidenceAlertEligible(args: {
  thesisId: string;
  starred: Iterable<string>;
  openIds: Iterable<string>;
  userPollIds: Set<string>;
}): boolean {
  const id = args.thesisId.trim();
  if (!id) return false;
  for (const x of Array.from(args.starred)) {
    if (x === id) return true;
  }
  for (const x of Array.from(args.openIds)) {
    if (x === id) return true;
  }
  return args.userPollIds.has(id);
}
