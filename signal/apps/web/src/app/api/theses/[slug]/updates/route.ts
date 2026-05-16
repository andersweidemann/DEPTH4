import { NextResponse } from "next/server";
import { requireThesisForSlug } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";
import { getSupabaseAndUserIdForThesisDetailApi } from "@/lib/thesis-engine-v2/thesis-detail-api-auth";
import { createThesisMutationService } from "@/lib/thesis-mutation";
import type { ThesisUpdateListItem } from "@/types/thesis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mapUpdateItem(row: {
  id: string;
  thesis_id: string;
  created_at: string;
  actor_type: string;
  actor_id: string | null;
  change_type: string;
  reason: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}): ThesisUpdateListItem {
  return {
    id: row.id,
    thesisId: row.thesis_id,
    createdAt: row.created_at,
    actorType: row.actor_type,
    actorId: row.actor_id,
    changeType: row.change_type,
    reason: row.reason,
    oldValues: row.old_values,
    newValues: row.new_values,
    metadata: row.metadata,
  };
}

export async function GET(req: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const { supabase, userId } = await getSupabaseAndUserIdForThesisDetailApi(req);
  const loaded = await requireThesisForSlug(supabase, slug, userId);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const thesisId = loaded.thesis.id.trim();
  const service = createThesisMutationService(supabase);
  const rows = await service.listUpdatesForThesis(thesisId, 100);

  const parent = await supabase
    .from("theses")
    .select("id, slug, title, supersedes_thesis_id")
    .eq("id", thesisId)
    .maybeSingle();

  const supersedesId =
    parent.data && typeof (parent.data as { supersedes_thesis_id?: unknown }).supersedes_thesis_id === "string"
      ? (parent.data as { supersedes_thesis_id: string }).supersedes_thesis_id
      : null;

  let supersedesSlug: string | null = null;
  if (supersedesId) {
    const { data: parentRow } = await supabase.from("theses").select("slug").eq("id", supersedesId).maybeSingle();
    supersedesSlug = typeof parentRow?.slug === "string" ? parentRow.slug : null;
  }

  return NextResponse.json({
    items: rows.map(mapUpdateItem),
    supersedesThesisId: supersedesId,
    supersedesSlug,
  });
}
