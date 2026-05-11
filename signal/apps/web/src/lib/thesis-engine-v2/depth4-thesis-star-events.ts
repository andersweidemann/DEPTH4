import type { SupabaseClient } from "@supabase/supabase-js";

export type Depth4ThesisStarEventAction = "star" | "unstar";

/** Best-effort audit row after `thesis_stars` upsert/delete succeeds. */
export async function appendDepth4ThesisStarEvent(
  sb: SupabaseClient,
  args: { userId: string; thesisId: string; action: Depth4ThesisStarEventAction },
): Promise<void> {
  const { error } = await sb.from("depth4_thesis_star_events").insert({
    user_id: args.userId,
    thesis_id: args.thesisId,
    action: args.action,
  } as never);
  if (error && process.env.NODE_ENV === "development") {
    console.warn("[depth4_thesis_star_events] insert failed", error.message);
  }
}
