import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import {
  collectRewritableBodyFields,
  rewriteThesisBody,
  type BodyRewriteChange,
} from "@/lib/thesis/rewrite-thesis-body";
import { rewriteThesisLanguage } from "@/lib/thesis/rewrite-thesis-language";
import { textLikelyNeedsComplianceRewrite } from "@/lib/thesis/thesis-language-compliance-audit";

export type RewriteAllThesesOptions = {
  /** Max rows to process (default 500). Use 2–3 for smoke tests. */
  limit?: number;
  /** When true, audit only — no LLM calls or DB writes. */
  dryRun?: boolean;
  /** Process a single slug. */
  slug?: string;
  /** Status filter (default live map statuses). */
  statuses?: string[];
  /**
   * Origins to rewrite. Default: `ai_generated` + `seeded_system` only (not user theses).
   * Pass `["user"]` or include user only with explicit opt-in.
   */
  thesisOrigins?: string[];
  /** Delay ms between theses when calling LLM (default 250). */
  throttleMs?: number;
};

export type ThesisRewriteLogEntry = {
  id: string;
  slug: string;
  titleBefore: string;
  titleAfter?: string;
  changed: boolean;
  fieldChanges: BodyRewriteChange[];
  error?: string;
};

export type RewriteAllThesesResult = {
  scanned: number;
  updated: number;
  skippedClean: number;
  errors: number;
  dryRun: boolean;
  logs: ThesisRewriteLogEntry[];
};

const DEFAULT_STATUSES = ["active", "watching", "ready"];
const DEFAULT_ORIGINS = ["ai_generated", "seeded_system"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function auditActiveThesesLanguage(
  sb: SupabaseClient,
  options?: Pick<RewriteAllThesesOptions, "limit" | "slug" | "statuses" | "thesisOrigins">,
): Promise<
  Array<{
    id: string;
    slug: string;
    title: string;
    thesis_origin: string | null;
    flaggedFields: number;
  }>
> {
  const statuses = options?.statuses ?? DEFAULT_STATUSES;
  const origins = options?.thesisOrigins ?? DEFAULT_ORIGINS;

  let q = sb
    .from("theses")
    .select("id, slug, title, body, thesis_origin")
    .in("status", statuses)
    .in("thesis_origin", origins)
    .order("updated_at", { ascending: false })
    .limit(options?.limit ?? 500);

  if (options?.slug?.trim()) {
    q = q.eq("slug", options.slug.trim());
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const r = row as {
      id: string;
      slug: string;
      title: string;
      body?: unknown;
      thesis_origin?: string | null;
    };
    const fields = collectRewritableBodyFields(r.body);
    const titleFlag = textLikelyNeedsComplianceRewrite(r.title ?? "");
    const flaggedFields =
      fields.filter((f) => textLikelyNeedsComplianceRewrite(f.value)).length + (titleFlag ? 1 : 0);
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      thesis_origin: r.thesis_origin ?? null,
      flaggedFields,
    };
  });
}

export async function rewriteAllTheses(options?: RewriteAllThesesOptions): Promise<RewriteAllThesesResult> {
  const sb = createServiceRoleClient();
  if (!sb) {
    return { scanned: 0, updated: 0, skippedClean: 0, errors: 1, dryRun: !!options?.dryRun, logs: [] };
  }

  const statuses = options?.statuses ?? DEFAULT_STATUSES;
  const origins = options?.thesisOrigins ?? DEFAULT_ORIGINS;
  const dryRun = options?.dryRun === true;
  const throttleMs = options?.throttleMs ?? 250;
  const logs: ThesisRewriteLogEntry[] = [];
  let updated = 0;
  let skippedClean = 0;
  let errors = 0;

  let q = sb
    .from("theses")
    .select("id, slug, title, body, thesis_origin")
    .in("status", statuses)
    .in("thesis_origin", origins)
    .order("updated_at", { ascending: false })
    .limit(options?.limit ?? 500);

  if (options?.slug?.trim()) {
    q = q.eq("slug", options.slug.trim());
  }

  const { data: theses, error } = await q;
  if (error) {
    throw new Error(error.message);
  }

  for (const row of theses ?? []) {
    const thesis = row as { id: string; slug: string; title: string; body?: unknown };
    const entry: ThesisRewriteLogEntry = {
      id: thesis.id,
      slug: thesis.slug,
      titleBefore: thesis.title,
      changed: false,
      fieldChanges: [],
    };

    try {
      const bodyResult = await rewriteThesisBody(thesis.body, {
        dryRun,
        rewriteFn: dryRun ? async (t) => t : rewriteThesisLanguage,
      });

      entry.fieldChanges = bodyResult.changes;
      skippedClean += bodyResult.fieldsSkippedClean;

      let titleAfter: string | undefined;
      const titleNeeds = textLikelyNeedsComplianceRewrite(thesis.title);
      if (titleNeeds && !dryRun) {
        titleAfter = await rewriteThesisLanguage(thesis.title);
      }

      const titleChanged = titleAfter != null && titleAfter.trim() !== thesis.title.trim();
      const changed = bodyResult.changed || titleChanged;

      if (changed && !dryRun) {
        const patch: Record<string, unknown> = {
          body: bodyResult.body,
          updated_at: new Date().toISOString(),
        };
        if (titleChanged && titleAfter) {
          patch.title = titleAfter;
          entry.titleAfter = titleAfter;
        }
        const { error: upErr } = await sb.from("theses").update(patch).eq("id", thesis.id);
        if (upErr) throw new Error(upErr.message);
        updated += 1;
        console.info("[rewriteAllTheses] ok", { slug: thesis.slug, fields: bodyResult.changes.length });
      } else if (dryRun && (bodyResult.changes.length > 0 || titleNeeds)) {
        entry.changed = true;
        if (titleNeeds) {
          entry.titleAfter = thesis.title;
        }
      } else if (!changed) {
        skippedClean += 1;
      }

      entry.changed = changed || (dryRun && entry.fieldChanges.length > 0);
      logs.push(entry);
    } catch (err) {
      errors += 1;
      entry.error = err instanceof Error ? err.message : String(err);
      logs.push(entry);
      console.error("[rewriteAllTheses] failed", { slug: thesis.slug, error: entry.error });
    }

    if (!dryRun && throttleMs > 0) {
      await sleep(throttleMs);
    }
  }

  return {
    scanned: theses?.length ?? 0,
    updated,
    skippedClean,
    errors,
    dryRun,
    logs,
  };
}
