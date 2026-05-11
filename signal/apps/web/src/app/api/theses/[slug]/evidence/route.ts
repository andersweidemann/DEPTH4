import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EvidenceItem } from "@/types/thesis";
import { requireThesisForSlug } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mapEvidenceRow(r: Record<string, unknown>): EvidenceItem {
  const desc = String(r.description ?? "");
  const meta =
    r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
      ? (r.metadata as Record<string, unknown>)
      : {};
  const source =
    typeof meta.source === "string"
      ? meta.source
      : typeof meta.publication === "string"
        ? meta.publication
        : "DEPTH4";
  const firstLine = desc.split("\n")[0]?.trim() ?? "";
  const title = firstLine || String(r.event_type ?? "Evidence");
  const rest = desc.includes("\n") ? desc.split("\n").slice(1).join("\n").trim() : "";
  const created = r.created_at;
  const timestamp =
    typeof created === "string"
      ? created
      : created instanceof Date
        ? created.toISOString()
        : new Date().toISOString();

  return {
    id: String(r.id ?? ""),
    timestamp,
    title,
    source,
    ...(rest ? { body: rest } : {}),
  };
}

export async function GET(_req: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const loaded = await requireThesisForSlug(supabase, slug, user?.id ?? null);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const thesisId = loaded.thesis.id.trim();
  const { data, error } = await supabase
    .from("thesis_evidence_log")
    .select("id, created_at, description, event_type, metadata")
    .eq("thesis_id", thesisId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json([], { status: 200 });

  const rows = (data ?? []) as Record<string, unknown>[];
  const items = rows.map(mapEvidenceRow).filter((x) => x.id.length > 0);
  return NextResponse.json(items);
}
