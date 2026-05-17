import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { normalizeSupabaseAnonKey, normalizeSupabaseUrl } from "@/lib/supabase/env";
import { createClient as createCookieSupabaseClient } from "@/lib/supabase/server";
import { resolveThesisExpandProxyConfig } from "@/lib/thesis-expand-api-proxy";

export const runtime = "nodejs";

function bearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

export async function POST(req: NextRequest) {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anon) {
    return NextResponse.json({ ok: false, error: "supabase_env_missing" }, { status: 500 });
  }

  const token = bearerToken(req);
  const cookieSb = await createCookieSupabaseClient();
  const { data: cookieAuth, error: cookieAuthErr } = await cookieSb.auth.getUser();
  let user = cookieAuth.user;

  if ((!user || cookieAuthErr) && token) {
    const bearerSb = createSupabaseJsClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: bearerAuth, error: bearerErr } = await bearerSb.auth.getUser(token);
    if (!bearerErr && bearerAuth.user) user = bearerAuth.user;
  }

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { idea?: unknown } | null;
  const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
  if (idea.length < 4) {
    return NextResponse.json({ ok: false, error: "idea_required" }, { status: 400 });
  }

  const proxy = resolveThesisExpandProxyConfig();
  if (!proxy.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: proxy.error,
        hint: proxy.hint,
        missing: proxy.missing,
      },
      { status: 503 },
    );
  }

  const upstream = await fetch(`${proxy.apiBase}/user/thesis-draft-expand`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Depth4-Ingest-Secret": proxy.ingestSecret,
    },
    body: JSON.stringify({ idea }),
  });

  const j = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  if (!upstream.ok || !j) {
    return NextResponse.json(
      {
        ok: false,
        error: "upstream_failed",
        status: upstream.status,
        upstreamBody: j,
      },
      { status: 502 },
    );
  }

  return NextResponse.json(j);
}
