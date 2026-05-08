import { type NextRequest, NextResponse } from "next/server";

/**
 * Validates cron callers via shared secrets (no session cookies).
 * Accepts `x-insider-flow-secret: <secret>` or `Authorization: Bearer <secret>`.
 * Either INSIDER_FLOW_CRON_SECRET or CRON_SECRET may be set (request must match one of them).
 *
 * Values are compared after `.trim()` on both env vars and header values (Vercel paste/newline safe).
 */

export type CronAuthDebug = {
  hasCRON_SECRET: boolean;
  hasINSIDER_FLOW_CRON_SECRET: boolean;
  hasAuthorizationHeader: boolean;
  hasXInsiderFlowSecretHeader: boolean;
  parsedBearerPrefixOk: boolean;
  /** Raw env string differs from trimmed (whitespace, stray newlines, etc.). */
  cronSecretEnvTrimChanged: boolean;
  insiderFlowSecretEnvTrimChanged: boolean;
  /** After trim, supplied x-insider-flow-secret equals at least one configured secret. */
  anySecretMatchesXHeader: boolean;
  /** After trim, Bearer token equals at least one configured secret. */
  anySecretMatchesBearerValue: boolean;
};

function isCronAuthDebugEnabled(): boolean {
  return (process.env.CRON_AUTH_DEBUG ?? "").trim() === "1";
}

/** Booleans only — never includes secrets or secret lengths. */
export function buildCronAuthDebug(req: NextRequest): CronAuthDebug {
  const rawCron = process.env.CRON_SECRET;
  const rawInsider = process.env.INSIDER_FLOW_CRON_SECRET;
  const trimCron = (rawCron ?? "").trim();
  const trimInsider = (rawInsider ?? "").trim();
  const secrets = [trimInsider, trimCron].filter((s) => s.length > 0);

  const authTrimmed = (req.headers.get("authorization") ?? "").trim();
  const xTrimmed = (req.headers.get("x-insider-flow-secret") ?? "").trim();

  const lowerAuth = authTrimmed.toLowerCase();
  const parsedBearerPrefixOk = lowerAuth.startsWith("bearer ");
  const bearerValue = parsedBearerPrefixOk ? authTrimmed.slice(7).trim() : "";

  return {
    hasCRON_SECRET: trimCron.length > 0,
    hasINSIDER_FLOW_CRON_SECRET: trimInsider.length > 0,
    hasAuthorizationHeader: authTrimmed.length > 0,
    hasXInsiderFlowSecretHeader: xTrimmed.length > 0,
    parsedBearerPrefixOk,
    cronSecretEnvTrimChanged: rawCron !== undefined && rawCron !== trimCron,
    insiderFlowSecretEnvTrimChanged: rawInsider !== undefined && rawInsider !== trimInsider,
    anySecretMatchesXHeader: secrets.length > 0 && secrets.some((s) => s === xTrimmed),
    anySecretMatchesBearerValue: secrets.length > 0 && parsedBearerPrefixOk && secrets.some((s) => s === bearerValue),
  };
}

function jsonWithOptionalDebug(req: NextRequest, body: Record<string, unknown>, status: number) {
  const payload =
    isCronAuthDebugEnabled() ? { ...body, debug: buildCronAuthDebug(req) } : body;
  return NextResponse.json(payload, { status });
}

export function assertCronSecret(req: NextRequest): NextResponse | null {
  const rawCron = process.env.CRON_SECRET;
  const rawInsider = process.env.INSIDER_FLOW_CRON_SECRET;
  const trimCron = (rawCron ?? "").trim();
  const trimInsider = (rawInsider ?? "").trim();
  const secrets = [trimInsider, trimCron].filter((s) => s.length > 0);

  if (!secrets.length) {
    return jsonWithOptionalDebug(req, { ok: false, error: "cron_secret_not_configured" }, 503);
  }

  const xTrimmed = (req.headers.get("x-insider-flow-secret") ?? "").trim();
  const authTrimmed = (req.headers.get("authorization") ?? "").trim();
  const lowerAuth = authTrimmed.toLowerCase();
  const bearerValue = lowerAuth.startsWith("bearer ") ? authTrimmed.slice(7).trim() : "";
  const ok = secrets.some((s) => s === xTrimmed || s === bearerValue);

  if (isCronAuthDebugEnabled()) {
    const d = buildCronAuthDebug(req);
    console.info("[cron-auth] assertCronSecret", d);
  }

  if (!ok) {
    return jsonWithOptionalDebug(req, { ok: false, error: "unauthorized" }, 401);
  }
  return null;
}
