import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadApiThesisPayload } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payload = await loadApiThesisPayload(supabase, slug, user?.id ?? null);
  if (!payload) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(payload.apiThesis);
}
