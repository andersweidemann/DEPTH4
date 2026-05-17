import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canManageThesisReaderPublic,
  ensureThesisRowForCatalogSlug,
  fetchThesisReaderPublicRow,
  setThesisReaderPublic,
} from "@/lib/thesis-engine-v2/thesis-reader-public";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  let row = await fetchThesisReaderPublicRow(slug);
  if (!row) row = await ensureThesisRowForCatalogSlug(slug);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const enabled = row?.reader_public_enabled === true;
  const canManage = row && user ? canManageThesisReaderPublic(row, user.id) : false;

  return NextResponse.json({
    enabled,
    canManage,
    status: enabled ? "public" : "private",
  });
}

export async function PATCH(req: NextRequest, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const enabled = (body as { enabled?: unknown })?.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "invalid_enabled" }, { status: 400 });
  }

  const ok = await setThesisReaderPublic(slug, enabled, user.id);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({
    enabled,
    status: enabled ? "public" : "private",
  });
}
