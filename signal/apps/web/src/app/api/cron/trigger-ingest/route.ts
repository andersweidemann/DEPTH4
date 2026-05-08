import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function assertCron(req: NextRequest): NextResponse | null {
  const secrets = [process.env.INSIDER_FLOW_CRON_SECRET, process.env.CRON_SECRET]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  if (!secrets.length) return null;
  const got = (req.headers.get("x-insider-flow-secret") ?? "").trim();
  const auth = (req.headers.get("authorization") ?? "").trim();
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const ok = secrets.some((s) => s === got || s === bearer);
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return null;
}

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
  const deny = assertCron(req);
  if (deny) return deny;
  return runTriggerIngest();
}

export async function POST(req: NextRequest) {
  const deny = assertCron(req);
  if (deny) return deny;
  return runTriggerIngest();
}

