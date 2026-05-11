import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireThesisForSlug } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OUTCOME_COOKIE = "depth4_thesis_session_outcomes";

export async function POST(_req: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const loaded = await requireThesisForSlug(supabase, slug, user?.id ?? null);
  if (!loaded) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const jar = cookies();
  let map: Record<string, string> = {};
  try {
    const raw = jar.get(OUTCOME_COOKIE)?.value;
    if (raw) map = JSON.parse(raw) as Record<string, string>;
  } catch {
    map = {};
  }
  if (typeof map !== "object" || map === null || Array.isArray(map)) map = {};
  delete map[slug];

  jar.set(OUTCOME_COOKIE, JSON.stringify(map), {
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
    sameSite: "lax",
    httpOnly: true,
  });

  return NextResponse.json({ ok: true });
}
