export const THESIS_OUTCOME_COOKIE = "depth4_thesis_session_outcomes";

export type ThesisOutcomeEntry = {
  slug: string;
  outcome: "resolved" | "invalidated";
  resolvedAt: string;
};

function normalizeOutcomeEntry(value: unknown): { outcome: "resolved" | "invalidated"; at: string } | null {
  if (value === "resolved" || value === "invalidated") {
    return { outcome: value, at: new Date().toISOString() };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const oc = o.outcome ?? o.o;
    const atRaw = o.at ?? o.resolvedAt;
    const at = typeof atRaw === "string" && atRaw.trim() ? atRaw : new Date().toISOString();
    if (oc === "resolved" || oc === "invalidated") return { outcome: oc, at };
  }
  return null;
}

export function parseThesisOutcomeCookie(raw: string | undefined): ThesisOutcomeEntry[] {
  if (!raw?.trim()) return [];
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o)) return [];
    const out: ThesisOutcomeEntry[] = [];
    for (const [slug, v] of Object.entries(o)) {
      const n = normalizeOutcomeEntry(v);
      if (!n || !slug.trim()) continue;
      out.push({ slug: slug.trim(), outcome: n.outcome, resolvedAt: n.at });
    }
    return out;
  } catch {
    return [];
  }
}

export function setOutcomeInCookieJson(prevJson: string | undefined, slug: string, outcome: "resolved" | "invalidated"): string {
  let map: Record<string, unknown> = {};
  try {
    if (prevJson?.trim()) map = JSON.parse(prevJson) as Record<string, unknown>;
  } catch {
    map = {};
  }
  if (typeof map !== "object" || map === null || Array.isArray(map)) map = {};
  map[slug.trim()] = { outcome, at: new Date().toISOString() };
  return JSON.stringify(map);
}

export function removeOutcomeFromCookieJson(prevJson: string | undefined, slug: string): string {
  let map: Record<string, unknown> = {};
  try {
    if (prevJson?.trim()) map = JSON.parse(prevJson) as Record<string, unknown>;
  } catch {
    map = {};
  }
  if (typeof map !== "object" || map === null || Array.isArray(map)) map = {};
  delete map[slug.trim()];
  return JSON.stringify(map);
}
