import type { SupabaseClient } from "@supabase/supabase-js";
import type { ThesisInsertInput, ThesisRow } from "@/lib/thesis-mutation/types";

const THESIS_SELECT =
  "id, title, status, slug, thesis_origin, owner_user_id, scenario_probabilities, insider_flow, body, micro_label, lifecycle_state, supersedes_thesis_id, lineage_root_thesis_id, created_at, updated_at";

function mapRow(raw: Record<string, unknown>): ThesisRow {
  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? ""),
    status: String(raw.status ?? ""),
    slug: typeof raw.slug === "string" ? raw.slug : null,
    thesis_origin: String(raw.thesis_origin ?? ""),
    owner_user_id: typeof raw.owner_user_id === "string" ? raw.owner_user_id : null,
    scenario_probabilities: raw.scenario_probabilities ?? null,
    insider_flow: raw.insider_flow ?? null,
    body: raw.body ?? null,
    micro_label: typeof raw.micro_label === "string" ? raw.micro_label : null,
    lifecycle_state: typeof raw.lifecycle_state === "string" ? raw.lifecycle_state : null,
    supersedes_thesis_id: typeof raw.supersedes_thesis_id === "string" ? raw.supersedes_thesis_id : null,
    lineage_root_thesis_id: typeof raw.lineage_root_thesis_id === "string" ? raw.lineage_root_thesis_id : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

export class SupabaseThesisRepository {
  constructor(private readonly sb: SupabaseClient) {}

  async findById(id: string): Promise<ThesisRow | null> {
    const { data, error } = await this.sb.from("theses").select(THESIS_SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapRow(data as Record<string, unknown>);
  }

  async insert(row: ThesisInsertInput & { supersedes_thesis_id?: string | null; lineage_root_thesis_id: string }): Promise<ThesisRow> {
    const { data, error } = await this.sb.from("theses").insert(row as never).select(THESIS_SELECT).single();
    if (error) throw new Error(error.message);
    return mapRow(data as Record<string, unknown>);
  }

  async update(id: string, changes: Partial<ThesisRow>): Promise<ThesisRow> {
    const { data, error } = await this.sb.from("theses").update(changes as never).eq("id", id).select(THESIS_SELECT).single();
    if (error) throw new Error(error.message);
    return mapRow(data as Record<string, unknown>);
  }
}
