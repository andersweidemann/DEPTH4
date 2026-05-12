import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/auth/supabase-route-client";
import {
  setOutcomeInCookieJson,
  THESIS_OUTCOME_COOKIE,
} from "@/lib/thesis-engine-v2/thesis-outcome-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireSupabaseUser(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const thesisSlug = typeof o.thesisSlug === "string" ? o.thesisSlug.trim() : "";
  const outcome = o.outcome;
  if (!thesisSlug) return NextResponse.json({ ok: false, error: "thesis_slug_required" }, { status: 400 });
  if (outcome !== "resolved" && outcome !== "invalidated") {
    return NextResponse.json({ ok: false, error: "invalid_outcome" }, { status: 400 });
  }

  const jar = cookies();
  const prev = jar.get(THESIS_OUTCOME_COOKIE)?.value;
  const nextJson = setOutcomeInCookieJson(prev, thesisSlug, outcome);

  jar.set(THESIS_OUTCOME_COOKIE, nextJson, {
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
    sameSite: "lax",
    httpOnly: true,
  });

  return NextResponse.json({ success: true });
}
