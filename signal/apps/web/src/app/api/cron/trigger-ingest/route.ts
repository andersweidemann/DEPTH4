import { type NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/cron-auth";

export const runtime = "nodejs";

async function runTriggerIngest() {
  const apiBase = (process.env.DEPTH4_API_BASE_URL || "").trim().replace(/\/$/, "");
  const secret = (process.env.DEPTH4_INGEST_CRON_SECRET || "").trim();
  if (!apiBase) {
    return NextResponse.json({ ok: false, error: "Missing DEPTH4_API_BASE_URL" }, { status: 500 });
  }
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Missing DEPTH4_INGEST_CRON_SECRET" }, { status: 500 });
  }

  const res = await fetch(`${apiBase}/cron/ingest-once`, {
    method: "POST",
    headers: {
      "X-Depth4-Ingest-Secret": secret,
    },
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  return NextResponse.json(
    {
      ok: res.ok,
      status: res.status,
      body: text.slice(0, 2_000),
    },
    { status: res.ok ? 200 : 502 },
  );
}

export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runTriggerIngest();
}

export async function POST(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runTriggerIngest();
}

