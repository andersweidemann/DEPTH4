import type { ThesisUpdateListItem } from "@/types/thesis";

/** Max absolute % point change on any scenario leg (base/bull/bear) for magnitude bands. */
export const SCENARIO_SHIFT_SLIGHT_MAX = 5;
export const SCENARIO_SHIFT_MODEST_MAX = 15;

export const RECENT_THESIS_UPDATES_WINDOW_DAYS = 7;

export type ScenarioShiftMagnitude = "slightly" | "modestly" | "materially";

export type UpdateSourceBucket = "news" | "macro" | "user" | "scheduler" | "system";

export type RecentThesisUpdatesSummary = {
  windowDays: number;
  updateCount: number;
  /** One or two user-facing sentences (no raw JSON). */
  lines: string[];
  scenarioShift: ScenarioShiftMagnitude | null;
  lastUpdatedAt: string | null;
  lastUpdatedRelative: string | null;
};

type ScenarioTriple = { base: number; bull: number; bear: number };

function parseScenarioTriple(raw: unknown): ScenarioTriple | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const base = Number(o.base);
  const bull = Number(o.bull);
  const bear = Number(o.bear);
  if (![base, bull, bear].every((n) => Number.isFinite(n))) return null;
  return { base, bull, bear };
}

function scenarioFromUpdateValues(values: Record<string, unknown> | null): ScenarioTriple | null {
  if (!values) return null;
  return parseScenarioTriple(values.scenario_probabilities);
}

/** Largest absolute move on base/bull/bear between two snapshots. */
export function maxScenarioProbabilityDelta(
  before: ScenarioTriple | null,
  after: ScenarioTriple | null,
): number | null {
  if (!before || !after) return null;
  const deltas = [
    Math.abs(after.base - before.base),
    Math.abs(after.bull - before.bull),
    Math.abs(after.bear - before.bear),
  ];
  return Math.max(...deltas);
}

export function classifyScenarioShiftMagnitude(maxDelta: number): ScenarioShiftMagnitude {
  if (maxDelta <= SCENARIO_SHIFT_SLIGHT_MAX) return "slightly";
  if (maxDelta <= SCENARIO_SHIFT_MODEST_MAX) return "modestly";
  return "materially";
}

export function classifyUpdateSourceBucket(update: Pick<ThesisUpdateListItem, "actorType" | "changeType" | "metadata">): UpdateSourceBucket {
  const actor = update.actorType.trim().toLowerCase();
  if (actor === "user") return "user";
  if (actor === "news") return "news";
  if (actor === "macro") return "macro";
  if (actor === "scheduler") return "scheduler";

  if (update.changeType === "evidence") {
    const src = String(update.metadata?.source ?? "").toLowerCase();
    if (src.includes("news") || update.metadata?.event_id != null || update.metadata?.news_event_id != null) {
      return "news";
    }
    if (src.includes("macro")) return "macro";
  }

  return "system";
}

function formatBucketPhrase(bucket: UpdateSourceBucket, count: number, includeCountPrefix = true): string {
  if (count <= 0) return "";
  const n = includeCountPrefix ? `${count} ` : "";
  switch (bucket) {
    case "news":
      return `${n}news-linked`.trim();
    case "macro":
      return `${n}macro-linked`.trim();
    case "user":
      return count === 1 && !includeCountPrefix ? "user edit" : `${n}${count === 1 ? "user edit" : "user edits"}`.trim();
    case "scheduler":
      return `${n}${count === 1 ? "scheduled refresh" : "scheduled refreshes"}`.trim();
    case "system":
      return `${n}${count === 1 ? "system update" : "system updates"}`.trim();
    default:
      return `${n}${count === 1 ? "update" : "updates"}`.trim();
  }
}

const BUCKET_ORDER: UpdateSourceBucket[] = ["news", "macro", "user", "scheduler", "system"];

function buildSourceMixPhrase(counts: Record<UpdateSourceBucket, number>): string {
  const parts = BUCKET_ORDER.map((b) => formatBucketPhrase(b, counts[b], true)).filter(Boolean);
  return parts.join(", ");
}

function scenarioShiftFromUpdate(
  update: Pick<ThesisUpdateListItem, "oldValues" | "newValues">,
): number | null {
  const oldScenario = scenarioFromUpdateValues(update.oldValues);
  const newScenario = scenarioFromUpdateValues(update.newValues);
  if (oldScenario && newScenario) return maxScenarioProbabilityDelta(oldScenario, newScenario);

  const oldOnly = update.oldValues?.scenario_probabilities;
  const newOnly = update.newValues?.scenario_probabilities;
  if (oldOnly != null && newOnly != null) {
    return maxScenarioProbabilityDelta(parseScenarioTriple(oldOnly), parseScenarioTriple(newOnly));
  }
  return null;
}

export function formatRecentUpdateRelative(iso: string, nowMs: number): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diffMin = Math.floor((nowMs - t) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 48) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

/**
 * Deterministic 7-day trust summary from `thesis_updates` rows (Phase 3A).
 */
export function summarizeRecentThesisUpdates(
  updates: ThesisUpdateListItem[],
  nowMs: number = Date.now(),
): RecentThesisUpdatesSummary {
  const windowMs = RECENT_THESIS_UPDATES_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = nowMs - windowMs;

  const recent = updates.filter((u) => {
    const t = Date.parse(u.createdAt);
    return !Number.isNaN(t) && t >= cutoff;
  });

  const empty: RecentThesisUpdatesSummary = {
    windowDays: RECENT_THESIS_UPDATES_WINDOW_DAYS,
    updateCount: 0,
    lines: ["No meaningful changes recorded in the last 7 days."],
    scenarioShift: null,
    lastUpdatedAt: null,
    lastUpdatedRelative: null,
  };

  if (!recent.length) return empty;

  const counts: Record<UpdateSourceBucket, number> = {
    news: 0,
    macro: 0,
    user: 0,
    scheduler: 0,
    system: 0,
  };

  let maxScenarioDelta: number | null = null;
  let latestIso: string | null = null;
  let latestTs = -Infinity;

  for (const u of recent) {
    const bucket = classifyUpdateSourceBucket(u);
    counts[bucket] += 1;

    const delta = scenarioShiftFromUpdate(u);
    if (delta != null) maxScenarioDelta = maxScenarioDelta == null ? delta : Math.max(maxScenarioDelta, delta);

    const t = Date.parse(u.createdAt);
    if (!Number.isNaN(t) && t > latestTs) {
      latestTs = t;
      latestIso = u.createdAt;
    }
  }

  const mix = buildSourceMixPhrase(counts);
  const lines: string[] = [];

  if (recent.length === 1) {
    const single = formatBucketPhrase(classifyUpdateSourceBucket(recent[0]!), 1, false);
    lines.push(`Last 7 days: 1 update — ${single}.`);
  } else {
    lines.push(`Last 7 days: ${recent.length} updates — ${mix}.`);
  }

  const scenarioShift =
    maxScenarioDelta != null ? classifyScenarioShiftMagnitude(maxScenarioDelta) : null;

  if (scenarioShift) {
    const verb = scenarioShift === "slightly" ? "changed" : "shifted";
    lines.push(`Scenario probabilities ${verb} ${scenarioShift}.`);
  } else {
    lines.push("Recent updates recorded, with no major scenario shift.");
  }

  return {
    windowDays: RECENT_THESIS_UPDATES_WINDOW_DAYS,
    updateCount: recent.length,
    lines: lines.slice(0, 2),
    scenarioShift,
    lastUpdatedAt: latestIso,
    lastUpdatedRelative: latestIso ? formatRecentUpdateRelative(latestIso, nowMs) : null,
  };
}
