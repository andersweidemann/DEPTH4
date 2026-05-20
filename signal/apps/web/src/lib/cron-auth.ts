import { type NextRequest, NextResponse } from "next/server";

/**
 * Validates cron callers via shared secrets (no session cookies).
 *
 * Accepted credentials (trimmed on both env and request values):
 * - `Authorization: Bearer <secret>`
 * - `Authorization: <secret>` (no Bearer — common on external schedulers)
 * - `x-insider-flow-secret: <secret>`
 * - `x-cron-secret: <secret>`
 *
 * Either `INSIDER_FLOW_CRON_SECRET` or `CRON_SECRET` may be set (request must match one of them).
 */

export type CronAuthDebug = {
  hasCRON_SECRET: boolean;
  hasINSIDER_FLOW_CRON_SECRET: boolean;
  hasAuthorizationHeader: boolean;
  hasXInsiderFlowSecretHeader: boolean;
  hasXCronSecretHeader: boolean;
  parsedBearerPrefixOk: boolean;
  authorizationTreatedAsRawToken: boolean;
  /** Raw env string differs from trimmed (whitespace, stray newlines, etc.). */
  cronSecretEnvTrimChanged: boolean;
  insiderFlowSecretEnvTrimChanged: boolean;
  /** After trim, supplied x-insider-flow-secret equals at least one configured secret. */
  anySecretMatchesXHeader: boolean;
  /** After trim, supplied x-cron-secret equals at least one configured secret. */
  anySecretMatchesXCronHeader: boolean;
  /** After trim, Authorization (Bearer or raw token) equals at least one configured secret. */
  anySecretMatchesAuthorization: boolean;
};

function isCronAuthDebugEnabled(): boolean {
  return (process.env.CRON_AUTH_DEBUG ?? "").trim() === "1";
}

export function configuredCronSecrets(): string[] {
  const trimCron = (process.env.CRON_SECRET ?? "").trim();
  const trimInsider = (process.env.INSIDER_FLOW_CRON_SECRET ?? "").trim();
  return [trimInsider, trimCron].filter((s) => s.length > 0);
}

/** Parses Authorization + cron secret headers from the request. */
export function parseCronAuthHeaders(req: NextRequest): {
  authorizationValue: string;
  parsedBearerPrefixOk: boolean;
  authorizationTreatedAsRawToken: boolean;
  xInsiderFlowSecret: string;
  xCronSecret: string;
} {
  const authTrimmed = (req.headers.get("authorization") ?? "").trim();
  const lowerAuth = authTrimmed.toLowerCase();
  const parsedBearerPrefixOk = lowerAuth.startsWith("bearer ");
  let authorizationValue = "";
  let authorizationTreatedAsRawToken = false;
  if (parsedBearerPrefixOk) {
    authorizationValue = authTrimmed.slice(7).trim();
  } else if (authTrimmed.length > 0) {
    authorizationValue = authTrimmed;
    authorizationTreatedAsRawToken = true;
  }
  return {
    authorizationValue,
    parsedBearerPrefixOk,
    authorizationTreatedAsRawToken,
    xInsiderFlowSecret: (req.headers.get("x-insider-flow-secret") ?? "").trim(),
    xCronSecret: (req.headers.get("x-cron-secret") ?? "").trim(),
  };
}

export function cronAuthMatches(req: NextRequest, secrets: string[]): boolean {
  if (!secrets.length) return false;
  const h = parseCronAuthHeaders(req);
  const supplied = [h.authorizationValue, h.xInsiderFlowSecret, h.xCronSecret].filter((s) => s.length > 0);
  return supplied.some((value) => secrets.some((secret) => secret === value));
}

/** Booleans only — never includes secrets or secret lengths. */
export function buildCronAuthDebug(req: NextRequest): CronAuthDebug {
  const rawCron = process.env.CRON_SECRET;
  const rawInsider = process.env.INSIDER_FLOW_CRON_SECRET;
  const trimCron = (rawCron ?? "").trim();
  const trimInsider = (rawInsider ?? "").trim();
  const secrets = configuredCronSecrets();
  const h = parseCronAuthHeaders(req);
  const authTrimmed = (req.headers.get("authorization") ?? "").trim();

  return {
    hasCRON_SECRET: trimCron.length > 0,
    hasINSIDER_FLOW_CRON_SECRET: trimInsider.length > 0,
    hasAuthorizationHeader: authTrimmed.length > 0,
    hasXInsiderFlowSecretHeader: h.xInsiderFlowSecret.length > 0,
    hasXCronSecretHeader: h.xCronSecret.length > 0,
    parsedBearerPrefixOk: h.parsedBearerPrefixOk,
    authorizationTreatedAsRawToken: h.authorizationTreatedAsRawToken,
    cronSecretEnvTrimChanged: rawCron !== undefined && rawCron !== trimCron,
    insiderFlowSecretEnvTrimChanged: rawInsider !== undefined && rawInsider !== trimInsider,
    anySecretMatchesXHeader: secrets.length > 0 && secrets.some((s) => s === h.xInsiderFlowSecret),
    anySecretMatchesXCronHeader: secrets.length > 0 && secrets.some((s) => s === h.xCronSecret),
    anySecretMatchesAuthorization:
      secrets.length > 0 && h.authorizationValue.length > 0 && secrets.some((s) => s === h.authorizationValue),
  };
}

function jsonWithOptionalDebug(req: NextRequest, body: Record<string, unknown>, status: number) {
  const payload =
    isCronAuthDebugEnabled() ? { ...body, debug: buildCronAuthDebug(req) } : body;
  return NextResponse.json(payload, { status });
}

export function assertCronSecret(req: NextRequest): NextResponse | null {
  const secrets = configuredCronSecrets();

  if (!secrets.length) {
    return jsonWithOptionalDebug(req, { ok: false, error: "cron_secret_not_configured" }, 503);
  }

  if (isCronAuthDebugEnabled()) {
    console.info("[cron-auth] assertCronSecret", buildCronAuthDebug(req));
  }

  if (!cronAuthMatches(req, secrets)) {
    return jsonWithOptionalDebug(req, { ok: false, error: "unauthorized" }, 401);
  }
  return null;
}
