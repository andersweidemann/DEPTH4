import type { SupabaseClient } from "@supabase/supabase-js";
import { ThesisMutationAuditError } from "@/lib/thesis-mutation/errors";
import { createThesisMutationService, isThesisMutationEnabled } from "@/lib/thesis-mutation";
import type { MutationMeta, ThesisRowPatch } from "@/lib/thesis-mutation/types";

export type SystemThesisMutationResult =
  | { ok: true; audited: boolean }
  | { ok: false; error: string; auditFailed?: boolean };

const runCounters: Record<string, number> = {};

/** In-process counters for the current Node worker (cron response + logs). */
export function peekSystemMutationCounters(): Record<string, number> {
  return { ...runCounters };
}

export function resetSystemMutationCounters(): void {
  for (const k of Object.keys(runCounters)) delete runCounters[k];
}

function bumpCounter(actorType: string, audited: boolean): void {
  const key = audited ? `audited:${actorType}` : `direct:${actorType}`;
  runCounters[key] = (runCounters[key] ?? 0) + 1;
}

/**
 * Phase 2: route engine/cron thesis writes through {@link ThesisMutationService} when enabled.
 * On audit failure, compensates the thesis row and returns `auditFailed: true` (no silent success).
 */
export async function systemUpdateThesis(
  sb: SupabaseClient,
  thesisId: string,
  changes: ThesisRowPatch,
  meta: MutationMeta,
): Promise<SystemThesisMutationResult> {
  const actorType = meta.actorType ?? "system";

  if (!isThesisMutationEnabled()) {
    const { error } = await sb.from("theses").update(changes as never).eq("id", thesisId);
    if (error) return { ok: false, error: error.message };
    bumpCounter(actorType, false);
    return { ok: true, audited: false };
  }

  try {
    const mutation = createThesisMutationService(sb);
    await mutation.updateThesis(thesisId, changes, meta);
    bumpCounter(actorType, true);
    return { ok: true, audited: true };
  } catch (e) {
    if (e instanceof ThesisMutationAuditError) {
      return { ok: false, error: e.message, auditFailed: true };
    }
    return { ok: false, error: e instanceof Error ? e.message : "update_failed" };
  }
}

export async function systemTransitionThesisStatus(
  sb: SupabaseClient,
  thesisId: string,
  newStatus: string,
  meta: MutationMeta,
): Promise<SystemThesisMutationResult> {
  const actorType = meta.actorType ?? "system";

  if (!isThesisMutationEnabled()) {
    const { error } = await sb
      .from("theses")
      .update({ status: newStatus, updated_at: new Date().toISOString() } as never)
      .eq("id", thesisId);
    if (error) return { ok: false, error: error.message };
    bumpCounter(actorType, false);
    return { ok: true, audited: false };
  }

  try {
    const mutation = createThesisMutationService(sb);
    await mutation.transitionStatus(thesisId, newStatus, meta);
    bumpCounter(actorType, true);
    return { ok: true, audited: true };
  } catch (e) {
    if (e instanceof ThesisMutationAuditError) {
      return { ok: false, error: e.message, auditFailed: true };
    }
    return { ok: false, error: e instanceof Error ? e.message : "transition_failed" };
  }
}
