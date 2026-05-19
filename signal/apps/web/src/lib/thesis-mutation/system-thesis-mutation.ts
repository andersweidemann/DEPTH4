import type { SupabaseClient } from "@supabase/supabase-js";
import { ThesisMutationAuditError } from "@/lib/thesis-mutation/errors";
import { createThesisMutationService, isThesisMutationEnabled } from "@/lib/thesis-mutation";
import type { MutationMeta, ThesisInsertInput, ThesisRowPatch } from "@/lib/thesis-mutation/types";
import { enforceThesisQualityGate } from "@/lib/thesis/enforce-thesis-quality-gate";

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

/**
 * Phase 2B: audited thesis creation for engine paths (e.g. AI cluster registry).
 * On audit failure, deletes the inserted thesis row (compensate) and returns `auditFailed: true`.
 */
export async function systemCreateThesis(
  sb: SupabaseClient,
  data: ThesisInsertInput & Record<string, unknown>,
  meta: MutationMeta,
): Promise<SystemThesisMutationResult> {
  const actorType = meta.actorType ?? "system";
  const id = String(data.id ?? "").trim();
  if (!id) return { ok: false, error: "createThesis: id required" };

  if (!isThesisMutationEnabled()) {
    const { error } = await sb.from("theses").insert(data as never);
    if (error) return { ok: false, error: error.message };
    bumpCounter(actorType, false);
    return { ok: true, audited: false };
  }

  try {
    const mutation = createThesisMutationService(sb);
    await mutation.createThesis(data, meta);
    bumpCounter(actorType, true);
    return { ok: true, audited: true };
  } catch (e) {
    if (e instanceof ThesisMutationAuditError) {
      return { ok: false, error: e.message, auditFailed: true };
    }
    return { ok: false, error: e instanceof Error ? e.message : "insert_failed" };
  }
}

export async function systemTransitionThesisStatus(
  sb: SupabaseClient,
  thesisId: string,
  newStatus: string,
  meta: MutationMeta,
): Promise<SystemThesisMutationResult> {
  const actorType = meta.actorType ?? "system";

  const { data: existing } = await sb.from("theses").select("status").eq("id", thesisId).maybeSingle();
  const currentStatus =
    existing && typeof (existing as { status?: unknown }).status === "string"
      ? (existing as { status: string }).status
      : "forming";

  const gate = await enforceThesisQualityGate(sb, thesisId, currentStatus, newStatus);
  if (!gate.ok) {
    return { ok: false, error: gate.message };
  }

  const qualityPatch = gate.patch;

  if (!isThesisMutationEnabled()) {
    const { error } = await sb
      .from("theses")
      .update({ status: newStatus, updated_at: new Date().toISOString(), ...qualityPatch } as never)
      .eq("id", thesisId);
    if (error) return { ok: false, error: error.message };
    bumpCounter(actorType, false);
    return { ok: true, audited: false };
  }

  try {
    const mutation = createThesisMutationService(sb);
    await mutation.updateThesis(thesisId, { status: newStatus, ...qualityPatch }, meta);
    bumpCounter(actorType, true);
    return { ok: true, audited: true };
  } catch (e) {
    if (e instanceof ThesisMutationAuditError) {
      return { ok: false, error: e.message, auditFailed: true };
    }
    return { ok: false, error: e instanceof Error ? e.message : "transition_failed" };
  }
}
