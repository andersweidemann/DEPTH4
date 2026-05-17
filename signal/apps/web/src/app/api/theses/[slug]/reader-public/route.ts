import { NextRequest, NextResponse } from "next/server";
import { isDepth4ElevatedUser } from "@/lib/depth4-elevated-access";
import { createClient } from "@/lib/supabase/server";
import {
  canManageThesisReaderPublic,
  ensureThesisRowForCatalogSlug,
  fetchThesisReaderPublicRow,
  setThesisReaderPublic,
} from "@/lib/thesis-engine-v2/thesis-reader-public";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function resolveRow(slug: string) {
  let row = await fetchThesisReaderPublicRow(slug);
  if (!row) row = await ensureThesisRowForCatalogSlug(slug);
  return row;
}

function publishingContext(user: { id: string; email?: string | null }) {
  return {
    userId: user.id,
    isElevated: isDepth4ElevatedUser({ userId: user.id, email: user.email }),
  };
}

export async function GET(_req: NextRequest, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const row = await resolveRow(slug);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const enabled = row.reader_public_enabled === true;
  const canManage = user ? canManageThesisReaderPublic(row, publishingContext(user)) : false;

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

  const result = await setThesisReaderPublic(slug, enabled, publishingContext(user));
  if (result === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (result === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({
    enabled,
    status: enabled ? "public" : "private",
  });
}
