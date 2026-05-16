/** Row shape for `public.theses` mutation service (subset used in Phase 1). */
export type ThesisRow = {
  id: string;
  title: string;
  status: string;
  slug: string | null;
  thesis_origin: string;
  owner_user_id: string | null;
  scenario_probabilities: unknown;
  insider_flow: unknown;
  body: unknown;
  micro_label?: string | null;
  lifecycle_state?: string | null;
  supersedes_thesis_id: string | null;
  lineage_root_thesis_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ThesisInsertInput = Omit<
  ThesisRow,
  "supersedes_thesis_id" | "lineage_root_thesis_id" | "created_at" | "updated_at"
> & {
  created_at?: string;
  updated_at?: string;
};

export type ThesisUpdateChangeType =
  | "field_update"
  | "status_transition"
  | "evidence"
  | "successor_created"
  | (string & {});

export type ThesisUpdateRow = {
  id: string;
  thesis_id: string;
  created_at: string;
  actor_type: string;
  actor_id: string | null;
  change_type: ThesisUpdateChangeType;
  reason: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
};

export type MutationMeta = {
  actorType?: string;
  actorId?: string | null;
  reason?: string;
};
