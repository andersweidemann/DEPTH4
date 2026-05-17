/**
 * Next.js → Render/FastAPI proxy for user thesis draft expand and related admin LLM routes.
 *
 * **Vercel (web app)** must set:
 * - `NEXT_PUBLIC_API_URL` — public API base (e.g. https://your-api.onrender.com)
 * - `INGEST_CRON_SECRET` — same value as `INGEST_CRON_SECRET` on the API service
 *
 * Fallback: `DEPTH4_INGEST_CRON_SECRET` (used by some cron routes on web).
 */

export type ThesisExpandProxyConfig =
  | { ok: true; apiBase: string; ingestSecret: string }
  | { ok: false; error: "api_proxy_misconfigured"; missing: string[]; hint: string };

const MISSING_API = "NEXT_PUBLIC_API_URL (or DEPTH4_API_URL)";
const MISSING_SECRET = "INGEST_CRON_SECRET (or DEPTH4_INGEST_CRON_SECRET)";

export function resolveThesisExpandProxyConfig(): ThesisExpandProxyConfig {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? process.env.DEPTH4_API_URL ?? "").replace(/\/$/, "");
  const ingestSecret = (
    process.env.INGEST_CRON_SECRET ??
    process.env.DEPTH4_INGEST_CRON_SECRET ??
    ""
  ).trim();

  const missing: string[] = [];
  if (!apiBase) missing.push(MISSING_API);
  if (!ingestSecret) missing.push(MISSING_SECRET);

  if (missing.length > 0) {
    return {
      ok: false,
      error: "api_proxy_misconfigured",
      missing,
      hint: `Set on the Vercel web project: ${missing.join(" and ")}. INGEST_CRON_SECRET must match the Render API service.`,
    };
  }

  return { ok: true, apiBase, ingestSecret };
}
