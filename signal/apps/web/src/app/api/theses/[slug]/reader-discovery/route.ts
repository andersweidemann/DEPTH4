import { NextRequest, NextResponse } from "next/server";
import { isDepth4ElevatedUserAsync } from "@/lib/depth4-elevated-access";
import { createClient } from "@/lib/supabase/server";
import {
  canManageThesisReaderDiscovery,
  fetchThesisReaderDiscoveryRow,
  parseReaderDiscoveryLabel,
  setThesisReaderDiscovery,
} from "@/lib/thesis-engine-v2/thesis-reader-discovery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function publishingContext(user: { id: string; email?: string | null }) {
  return {
    userId: user.id,
    isElevated: await isDepth4ElevatedUserAsync({ userId: user.id, email: user.email }),
  };
}

export async function GET(_req: NextRequest, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const row = await fetchThesisReaderDiscoveryRow(slug);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const canManage = user
    ? canManageThesisReaderDiscovery(row, await publishingContext(user))
    : false;

  return NextResponse.json({
    ok: true,
    publicEnabled: row.reader_public_enabled,
    discoverable: row.reader_public_discoverable,
    label: row.reader_discovery_label,
    priority: row.reader_discovery_priority,
    canManage,
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

  const b = body as {
    discoverable?: unknown;
    label?: unknown;
    priority?: unknown;
  };

  if (typeof b.discoverable !== "boolean") {
    return NextResponse.json({ error: "invalid_discoverable" }, { status: 400 });
  }

  const label =
    b.label === null || b.label === undefined ? undefined : parseReaderDiscoveryLabel(b.label);
  if (b.label !== undefined && b.label !== null && label === null) {
    return NextResponse.json({ error: "invalid_label" }, { status: 400 });
  }

  const priority =
    typeof b.priority === "number" && Number.isFinite(b.priority) ? b.priority : undefined;

  const result = await setThesisReaderDiscovery(
    slug,
    { discoverable: b.discoverable, label, priority },
    await publishingContext(user),
  );

  if (result === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (result === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (result === "requires_public") {
    return NextResponse.json({ error: "requires_public_link" }, { status: 400 });
  }

  const row = await fetchThesisReaderDiscoveryRow(slug);
  return NextResponse.json({
    ok: true,
    discoverable: row?.reader_public_discoverable === true,
    label: row?.reader_discovery_label ?? null,
    priority: row?.reader_discovery_priority ?? 0,
  });
}
