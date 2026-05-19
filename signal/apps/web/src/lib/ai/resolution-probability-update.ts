import type { DbScenarioTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { ContinuousNewsItem } from "@/lib/ai/thesis-pipeline-continuous";
import type { PipelineLlmClient } from "@/lib/ai/thesis-pipeline-llm";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Normalize clean/messy/broken to DB keys (base=messy, bull=clean, bear=broken), sum 100, each leg 5–90. */
export function normalizeResolutionTriple(
  clean: number,
  messy: number,
  broken: number,
): DbScenarioTriple {
  let c = clamp(Math.round(clean), 5, 90);
  let m = clamp(Math.round(messy), 5, 90);
  let b = clamp(Math.round(broken), 5, 90);
  const total = c + m + b;
  if (total <= 0) return { base: 33, bull: 34, bear: 33 };
  c = Math.round((c / total) * 100);
  m = Math.round((m / total) * 100);
  b = 100 - c - m;
  if (b < 5) {
    b = 5;
    const rem = 95;
    c = Math.round((c / (c + m || 1)) * rem);
    m = rem - c;
  }
  if (c < 5) c = 5;
  if (m < 5) m = 5;
  b = 100 - c - m;
  return { base: m, bull: c, bear: b };
}

export function dbTripleToCleanMessyBroken(t: DbScenarioTriple): { clean: number; messy: number; broken: number } {
  return { clean: t.bull, messy: t.base, broken: t.bear };
}

export function maxScenarioDelta(before: DbScenarioTriple, after: DbScenarioTriple): number {
  return Math.max(
    Math.abs(after.bull - before.bull),
    Math.abs(after.base - before.base),
    Math.abs(after.bear - before.bear),
  );
}

export function formatScenarioShiftSummary(before: DbScenarioTriple, after: DbScenarioTriple): string {
  const b = dbTripleToCleanMessyBroken(before);
  const a = dbTripleToCleanMessyBroken(after);
  return `Resolution paths shifted: Clean ${b.clean}%→${a.clean}%, Messy ${b.messy}%→${a.messy}%, Broken ${b.broken}%→${a.broken}%`;
}

export async function updateResolutionProbabilities(
  thesis: {
    title: string;
    direction: string;
    body?: Record<string, unknown>;
  },
  current: DbScenarioTriple,
  newsItem: ContinuousNewsItem,
  llm: PipelineLlmClient,
): Promise<DbScenarioTriple> {
  const paths = thesis.body?.resolution_paths as
    | { clean?: string; messy?: string; broken?: string }
    | undefined;
  const cur = dbTripleToCleanMessyBroken(current);

  const prompt = [
    `Adjust resolution path probabilities for "${thesis.title}" (${thesis.direction}).`,
    "",
    `Current: Clean ${cur.clean}% — ${paths?.clean ?? "thesis fully confirmed"}`,
    `Messy ${cur.messy}% — ${paths?.messy ?? "partial confirmation"}`,
    `Broken ${cur.broken}% — ${paths?.broken ?? "thesis invalidated"}`,
    "",
    `New evidence: [${newsItem.source}] ${newsItem.headline}`,
    "",
    "Rules:",
    "- Evidence confirming thesis → Clean ↑, Broken ↓",
    "- Evidence weakening thesis → Broken ↑, Clean ↓",
    "- Mixed/unclear → Messy ↑",
    "- Total must equal 100; no path below 5% or above 90%",
    "- Move each leg by roughly 5–15 points unless headline is minor",
    "",
    'Output JSON only: {"clean":0-100,"messy":0-100,"broken":0-100}',
  ].join("\n");

  const raw = await llm.completeJson(prompt, 220);
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const clean = Number(o.clean);
    const messy = Number(o.messy);
    const broken = Number(o.broken);
    if ([clean, messy, broken].every((n) => Number.isFinite(n))) {
      return normalizeResolutionTriple(clean, messy, broken);
    }
  }

  return current;
}
