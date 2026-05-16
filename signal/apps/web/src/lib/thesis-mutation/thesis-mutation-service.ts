import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isThesisSuccessorEnabled } from "@/lib/thesis-mutation/feature-flags";
import { rowFieldDiff, snapshotThesisRow } from "@/lib/thesis-mutation/row-diff";
import { SupabaseThesisRepository } from "@/lib/thesis-mutation/repositories/supabase-thesis-repository";
import { SupabaseThesisUpdateRepository } from "@/lib/thesis-mutation/repositories/supabase-thesis-update-repository";
import type { MutationMeta, ThesisInsertInput, ThesisRow, ThesisUpdateChangeType } from "@/lib/thesis-mutation/types";

export class ThesisMutationService {
  constructor(
    private readonly thesisRepo: SupabaseThesisRepository,
    private readonly updateRepo: SupabaseThesisUpdateRepository,
  ) {}

  async createThesis(data: ThesisInsertInput, meta?: MutationMeta): Promise<ThesisRow> {
    const id = data.id.trim();
    if (!id) throw new Error("createThesis: id required");
    const now = data.updated_at ?? data.created_at ?? new Date().toISOString();
    const row: ThesisInsertInput & { supersedes_thesis_id: null; lineage_root_thesis_id: string } = {
      ...data,
      id,
      created_at: data.created_at ?? now,
      updated_at: data.updated_at ?? now,
      supersedes_thesis_id: null,
      lineage_root_thesis_id: id,
    };
    const inserted = await this.thesisRepo.insert(row);
    await this.logUpdate({
      thesisId: id,
      actorType: meta?.actorType ?? "system",
      actorId: meta?.actorId ?? null,
      changeType: "field_update",
      reason: meta?.reason ?? "Initial creation",
      oldValues: null,
      newValues: snapshotThesisRow(inserted as unknown as Record<string, unknown>),
    });
    return inserted;
  }

  async updateThesis(thesisId: string, changes: Partial<ThesisRow>, meta?: MutationMeta): Promise<ThesisRow> {
    const existing = await this.thesisRepo.findById(thesisId);
    if (!existing) throw new Error(`Thesis ${thesisId} not found`);

    const updatedAt = new Date().toISOString();
    const patch = { ...changes, updated_at: updatedAt };
    const updated = await this.thesisRepo.update(thesisId, patch);

    const oldSnap = snapshotThesisRow(existing as unknown as Record<string, unknown>);
    const newSnap = snapshotThesisRow(updated as unknown as Record<string, unknown>);

    await this.logUpdate({
      thesisId,
      actorType: meta?.actorType ?? "system",
      actorId: meta?.actorId ?? null,
      changeType: "field_update",
      reason: meta?.reason ?? "Mutable field update",
      oldValues: rowFieldDiff(oldSnap, newSnap),
      newValues: rowFieldDiff(newSnap, oldSnap),
    });
    return updated;
  }

  async transitionStatus(thesisId: string, newStatus: string, meta?: MutationMeta): Promise<ThesisRow> {
    const existing = await this.thesisRepo.findById(thesisId);
    if (!existing) throw new Error(`Thesis ${thesisId} not found`);

    const updated = await this.thesisRepo.update(thesisId, {
      status: newStatus,
      updated_at: new Date().toISOString(),
    });

    await this.logUpdate({
      thesisId,
      actorType: meta?.actorType ?? "system",
      actorId: meta?.actorId ?? null,
      changeType: "status_transition",
      reason: meta?.reason ?? "Lifecycle transition",
      oldValues: { status: existing.status },
      newValues: { status: newStatus },
    });
    return updated;
  }

  async createSuccessor(
    parentThesisId: string,
    successorData: ThesisInsertInput,
    meta?: MutationMeta,
  ): Promise<ThesisRow> {
    if (!isThesisSuccessorEnabled()) {
      throw new Error("createSuccessor disabled (ENABLE_THESIS_SUCCESSOR is off)");
    }

    const parent = await this.thesisRepo.findById(parentThesisId);
    if (!parent) throw new Error(`Parent thesis ${parentThesisId} not found`);

    const lineageRoot = parent.lineage_root_thesis_id?.trim() || parent.id;
    const successorId = successorData.id.trim() || randomUUID();
    const now = new Date().toISOString();

    const successor = await this.thesisRepo.insert({
      ...successorData,
      id: successorId,
      created_at: successorData.created_at ?? now,
      updated_at: successorData.updated_at ?? now,
      supersedes_thesis_id: parent.id,
      lineage_root_thesis_id: lineageRoot,
    });

    await this.logUpdate({
      thesisId: successorId,
      actorType: meta?.actorType ?? "system",
      actorId: meta?.actorId ?? null,
      changeType: "successor_created",
      reason: meta?.reason ?? "Core causal claim changed – new thesis created",
      oldValues: null,
      newValues: snapshotThesisRow(successor as unknown as Record<string, unknown>),
      metadata: { parentThesisId: parent.id },
    });

    await this.logUpdate({
      thesisId: parentThesisId,
      actorType: meta?.actorType ?? "system",
      actorId: meta?.actorId ?? null,
      changeType: "successor_created",
      reason: meta?.reason ?? "Successor thesis created due to claim change",
      oldValues: null,
      newValues: null,
      metadata: { successorThesisId: successorId },
    });

    return successor;
  }

  async listUpdatesForThesis(thesisId: string, limit = 100) {
    return this.updateRepo.listByThesisId(thesisId, limit);
  }

  private async logUpdate(opts: {
    thesisId: string;
    actorType: string;
    actorId: string | null;
    changeType: ThesisUpdateChangeType;
    reason: string | null;
    oldValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
  }) {
    await this.updateRepo.insert({
      id: randomUUID(),
      thesis_id: opts.thesisId,
      created_at: new Date().toISOString(),
      actor_type: opts.actorType,
      actor_id: opts.actorId,
      change_type: opts.changeType,
      reason: opts.reason,
      old_values: opts.oldValues,
      new_values: opts.newValues,
      metadata: opts.metadata ?? {},
    });
  }
}

export function createThesisMutationService(sb: SupabaseClient): ThesisMutationService {
  return new ThesisMutationService(new SupabaseThesisRepository(sb), new SupabaseThesisUpdateRepository(sb));
}
