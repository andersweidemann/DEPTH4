import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireThesisForSlug } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";
import {
  THESIS_OUTCOME_COOKIE,
  removeOutcomeFromCookieJson,
} from "@/lib/thesis-engine-v2/thesis-outcome-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const prev = jar.get(THESIS_OUTCOME_COOKIE)?.value;
  const nextJson = removeOutcomeFromCookieJson(prev, slug);

  jar.set(THESIS_OUTCOME_COOKIE, nextJson, {
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
    sameSite: "lax",
    httpOnly: true,
  });

  return NextResponse.json({ ok: true });
}
