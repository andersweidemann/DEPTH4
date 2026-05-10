import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function adminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_DEPTH4_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type UsageRow = {
  date: string;
  task_type: string;
  provider: string;
  model: string;
  tier: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  escalations: number;
  validation_failures: number;
  estimated_cost_usd: number;
};

type UsageOk = {
  from: string;
  to: string;
  days: number;
  rows: UsageRow[];
  totals: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
    premium_tier_estimated_cost_usd: number;
  };
};

export async function GET(req: Request) {
  const emails = adminEmails();
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const email = (user?.email ?? "").toLowerCase();
  if (!email || (emails.length && !emails.includes(email))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const rawDays = Number(searchParams.get("days") ?? "7");
  const days = Number.isFinite(rawDays) ? Math.min(90, Math.max(1, Math.floor(rawDays))) : 7;

  const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  const secret = (process.env.INGEST_CRON_SECRET ?? "").trim();
  if (!base || !secret) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_API_URL and INGEST_CRON_SECRET required for LLM usage proxy" },
      { status: 500 },
    );
  }

  const url = `${base}/admin/llm-usage?days=${days}`;
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

  const j = (await res.json()) as UsageOk | { detail?: string };
  if (!res.ok) {
    const detail = typeof (j as { detail?: unknown }).detail === "string" ? (j as { detail: string }).detail : `HTTP ${res.status}`;
    return NextResponse.json({ ok: false, error: detail }, { status: res.status >= 500 ? 502 : res.status });
  }

  return NextResponse.json({ ok: true, ...(j as UsageOk) });
}
