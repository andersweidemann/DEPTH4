import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

type BodyRecord = Record<string, unknown>;

/** Deterministic string swaps — faster than LLM for known bad phrases (VISION compliance). */
const REPLACEMENTS_BY_SLUG: Record<string, Record<string, string>> = {
  "shorting-wti-crude-ceasefire-framework-defla-c96389a4": {
    "We are initiating a short position in WTI crude oil (CL.1) with medium conviction based on an underpriced de-escalation scenario in the Middle East.":
      "This thesis suggests WTI crude oil may be overpricing geopolitical risk in the Middle East, with a potential downside bias if de-escalation progresses.",
    "We are initiating a short position in WTI crude oil":
      "This thesis suggests a potential mispricing in WTI crude oil",
    "We are initiating a short":
      "This thesis suggests a potential downside bias in",
    "Short CL.1":
      "The analysis identifies a potential downside bias in CL.1",
  },
};

const BODY_TEXT_KEYS = [
  "thesis_statement",
  "summary",
  "narrative",
  "market_misread",
  "trade",
  "trade_expression",
  "why_thesis_exists",
  "whats_unpriced",
] as const;

function applyReplacementsToText(text: string, replacements: Record<string, string>): string {
  let out = text;
  for (const [oldText, newText] of Object.entries(replacements)) {
    if (out.includes(oldText)) out = out.split(oldText).join(newText);
  }
  return out;
}

function rewriteBodyFields(body: BodyRecord, replacements: Record<string, string>): { next: BodyRecord; changed: boolean } {
  let changed = false;
  const next: BodyRecord = { ...body };
  for (const key of BODY_TEXT_KEYS) {
    const raw = next[key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    const updated = applyReplacementsToText(raw, replacements);
    if (updated !== raw) {
      next[key] = updated;
      changed = true;
    }
  }
  return { next, changed };
}

export type TargetedRewriteResult = {
  slug: string;
  changed: boolean;
  error?: string;
};

export async function rewriteTargetedThesisLanguage(
  sb?: SupabaseClient | null,
): Promise<TargetedRewriteResult[]> {
  const admin = sb ?? createServiceRoleClient();
  if (!admin) throw new Error("service_role_unavailable");

  const results: TargetedRewriteResult[] = [];

  for (const [slug, replacements] of Object.entries(REPLACEMENTS_BY_SLUG)) {
    try {
      const { data, error } = await admin.from("theses").select("id, title, body").eq("slug", slug).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data?.id) {
        results.push({ slug, changed: false });
        continue;
      }

      const row = data as { id: string; title: string; body: unknown };
      let title = String(row.title ?? "");
      let titleChanged = false;
      const titleNext = applyReplacementsToText(title, replacements);
      if (titleNext !== title) {
        title = titleNext;
        titleChanged = true;
      }

      const bodyObj =
        row.body && typeof row.body === "object" && !Array.isArray(row.body)
          ? (row.body as BodyRecord)
          : {};
      const { next: bodyNext, changed: bodyChanged } = rewriteBodyFields(bodyObj, replacements);

      if (!titleChanged && !bodyChanged) {
        results.push({ slug, changed: false });
        continue;
      }

      const { error: upErr } = await admin
        .from("theses")
        .update({
          ...(titleChanged ? { title } : {}),
          ...(bodyChanged ? { body: bodyNext } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (upErr) throw new Error(upErr.message);

      results.push({ slug, changed: true });
    } catch (e) {
      results.push({
        slug,
        changed: false,
        error: e instanceof Error ? e.message : "rewrite_failed",
      });
    }
  }

  return results;
}
