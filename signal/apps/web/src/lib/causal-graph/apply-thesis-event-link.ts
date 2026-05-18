import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateThesisEventLink,
  type ThesisLinkInput,
  type ValidationResult,
} from "@/lib/causal-graph/causal-validator";
import { loadEventLinkContext } from "@/lib/causal-graph/load-event-link-context";

export type ApplyThesisEventLinkResult =
  | { ok: true; validation: ValidationResult }
  | { ok: false; validation: ValidationResult; status: 400 | 404 | 500; error: string };

export async function applyThesisEventLink(
  admin: SupabaseClient,
  input: {
    thesisId: string;
    eventId: string;
    thesisForValidation: ThesisLinkInput;
    isPrimary?: boolean;
  },
): Promise<ApplyThesisEventLinkResult> {
  const ctx = await loadEventLinkContext(admin, input.eventId, input.thesisId);
  if (!ctx) {
    return {
      ok: false,
      validation: { valid: false, errors: ["Event not found"], warnings: [] },
      status: 404,
      error: "event_not_found",
    };
  }

  const validation = validateThesisEventLink(input.thesisForValidation, ctx.event, ctx.clusterTheses);
  if (!validation.valid) {
    return { ok: false, validation, status: 400, error: "causal_validation_failed" };
  }

  const { error: linkErr } = await admin.from("event_thesis_links").upsert(
    {
      event_id: input.eventId,
      thesis_id: input.thesisId,
      is_primary: input.isPrimary ?? true,
    },
    { onConflict: "event_id,thesis_id" },
  );

  if (linkErr) {
    return {
      ok: false,
      validation: { valid: false, errors: [linkErr.message], warnings: [] },
      status: 500,
      error: "link_failed",
    };
  }

  const { error: updErr } = await admin.from("theses").update({ event_id: input.eventId }).eq("id", input.thesisId);
  if (updErr) {
    return {
      ok: false,
      validation: { valid: false, errors: [updErr.message], warnings: [] },
      status: 500,
      error: "thesis_event_update_failed",
    };
  }

  return { ok: true, validation };
}
