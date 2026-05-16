import type { SupabaseClient } from "@supabase/supabase-js";
import type { ThesisUpdateRow } from "@/lib/thesis-mutation/types";

function mapUpdateRow(raw: Record<string, unknown>): ThesisUpdateRow {
  return {
    id: String(raw.id ?? ""),
    thesis_id: String(raw.thesis_id ?? ""),
    created_at: String(raw.created_at ?? ""),
    actor_type: String(raw.actor_type ?? ""),
    actor_id: typeof raw.actor_id === "string" ? raw.actor_id : null,
    change_type: String(raw.change_type ?? ""),
    reason: typeof raw.reason === "string" ? raw.reason : null,
    old_values:
      raw.old_values && typeof raw.old_values === "object" && !Array.isArray(raw.old_values)
        ? (raw.old_values as Record<string, unknown>)
        : null,
    new_values:
      raw.new_values && typeof raw.new_values === "object" && !Array.isArray(raw.new_values)
        ? (raw.new_values as Record<string, unknown>)
        : null,
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : {},
  };
}

export type ThesisUpdateInsert = Omit<ThesisUpdateRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export class SupabaseThesisUpdateRepository {
  constructor(private readonly sb: SupabaseClient) {}

  async insert(row: ThesisUpdateInsert): Promise<ThesisUpdateRow> {
    const payload = {
      id: row.id,
      thesis_id: row.thesis_id,
      created_at: row.created_at,
      actor_type: row.actor_type,
      actor_id: row.actor_id,
      change_type: row.change_type,
      reason: row.reason,
      old_values: row.old_values,
      new_values: row.new_values,
      metadata: row.metadata ?? {},
    };
    const { data, error } = await this.sb.from("thesis_updates").insert(payload as never).select("*").single();
    if (error) throw new Error(error.message);
    return mapUpdateRow(data as Record<string, unknown>);
  }

  async listByThesisId(thesisId: string, limit = 100): Promise<ThesisUpdateRow[]> {
    const { data, error } = await this.sb
      .from("thesis_updates")
      .select("*")
      .eq("thesis_id", thesisId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => mapUpdateRow(r as Record<string, unknown>));
  }
}
