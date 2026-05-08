import { type NextRequest, NextResponse } from "next/server";

/**
 * Validates cron callers via shared secrets (no session cookies).
 * Accepts `x-insider-flow-secret: <secret>` or `Authorization: Bearer <secret>`.
 * Either INSIDER_FLOW_CRON_SECRET or CRON_SECRET may be set (request must match one of them).
 */
export function assertCronSecret(req: NextRequest): NextResponse | null {
  const secrets = [process.env.INSIDER_FLOW_CRON_SECRET, process.env.CRON_SECRET]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  if (!secrets.length) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  const got = (req.headers.get("x-insider-flow-secret") ?? "").trim();
  const auth = (req.headers.get("authorization") ?? "").trim();
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const ok = secrets.some((s) => s === got || s === bearer);
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return null;
}
