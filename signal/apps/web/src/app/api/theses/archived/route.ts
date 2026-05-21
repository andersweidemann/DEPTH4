import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/auth/supabase-route-client";
import { resolveDepth4Privileges } from "@/lib/depth4-elevated-access";
import { SYSTEM_MUTATION, systemUpdateThesis } from "@/lib/thesis-mutation";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ArchivedRow = {
  id: string;
  slug: string;
  title: string;
  asset: string | null;
  archive_reason: string | null;
  archived_at: string | null;
  updated_at: string | null;
};

/** GET — archived catalog theses (readable by any signed-in user; restore is elevated-only). */
export async function GET(req: NextRequest) {
  const auth = await requireSupabaseUser(req);
  if (!auth.ok) return auth.response;

  const privileges = await resolveDepth4Privileges({ userId: auth.user.id, email: auth.user.email });

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("theses")
    .select("id, slug, title, asset, archive_reason, archived_at, updated_at")
    .eq("status", "archived")
    .order("archived_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const theses = ((data ?? []) as ArchivedRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    symbol: row.asset ?? "",
    archiveReason: row.archive_reason ?? "archived",
    archivedAt: row.archived_at ?? row.updated_at,
  }));

  return NextResponse.json({ ok: true, theses, canRestore: privileges.isElevated });
}

/** POST — restore an archived thesis to watching (elevated roles only). */
export async function POST(req: NextRequest) {
  const auth = await requireSupabaseUser(req);
  if (!auth.ok) return auth.response;

  const privileges = await resolveDepth4Privileges({ userId: auth.user.id, email: auth.user.email });
  if (!privileges.isElevated) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { slug?: string } | null;
  const slug = (body?.slug ?? "").trim();
  if (!slug) return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { data: row, error: fetchErr } = await admin
    .from("theses")
    .select("id, status")
    .eq("slug", slug)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 400 });
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (String((row as { status?: string }).status) !== "archived") {
    return NextResponse.json({ ok: false, error: "not_archived" }, { status: 400 });
  }

  const thesisId = String((row as { id: string }).id);
  const now = new Date().toISOString();
  const upd = await systemUpdateThesis(
    admin,
    thesisId,
    {
      status: "watching",
      lifecycle_state: "discovered",
      archive_reason: null,
      archived_at: null,
      updated_at: now,
    } as never,
    {
      actorType: SYSTEM_MUTATION.system.actorType,
      actorId: auth.user.id,
      reason: "Restored from archived via /api/theses/archived",
      changeType: "status_change",
      metadata: { slug, restored_by: auth.user.id },
    },
  );

  if (!upd.ok) return NextResponse.json({ ok: false, error: upd.error ?? "restore_failed" }, { status: 400 });

  return NextResponse.json({ ok: true, slug, thesisId });
}
