import { NextResponse } from "next/server";
import { requireDepth4Admin } from "@/lib/depth4-admin-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireDepth4Admin();
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const rawDays = Number(searchParams.get("days") ?? "7");
  const days = Number.isFinite(rawDays) ? Math.min(30, Math.max(1, Math.floor(rawDays))) : 7;

  const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  const secret = (process.env.INGEST_CRON_SECRET ?? "").trim();
  if (!base || !secret) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_API_URL and INGEST_CRON_SECRET required" },
      { status: 500 },
    );
  }

  const url = `${base}/admin/llm-ops-dashboard?days=${days}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "X-Depth4-Ingest-Secret": secret },
      cache: "no-store",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "fetch_failed" },
      { status: 502 },
    );
  }

  const j = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const detail = typeof j.detail === "string" ? j.detail : `HTTP ${res.status}`;
    return NextResponse.json({ ok: false, error: detail }, { status: res.status >= 500 ? 502 : res.status });
  }

  return NextResponse.json({ ok: true, ...j });
}
