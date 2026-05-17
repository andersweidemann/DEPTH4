import { describe, expect, it, afterEach } from "vitest";
import { resolveThesisExpandProxyConfig } from "@/lib/thesis-expand-api-proxy";

describe("resolveThesisExpandProxyConfig", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  it("resolves when NEXT_PUBLIC_API_URL and INGEST_CRON_SECRET are set", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    process.env.INGEST_CRON_SECRET = "secret";
    delete process.env.DEPTH4_INGEST_CRON_SECRET;
    const c = resolveThesisExpandProxyConfig();
    expect(c.ok).toBe(true);
    if (c.ok) {
      expect(c.apiBase).toBe("https://api.example.com");
      expect(c.ingestSecret).toBe("secret");
    }
  });

  it("falls back to DEPTH4_INGEST_CRON_SECRET", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    delete process.env.INGEST_CRON_SECRET;
    process.env.DEPTH4_INGEST_CRON_SECRET = "depth4-secret";
    const c = resolveThesisExpandProxyConfig();
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.ingestSecret).toBe("depth4-secret");
  });

  it("reports misconfiguration when API URL or secret missing", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.DEPTH4_API_URL;
    delete process.env.INGEST_CRON_SECRET;
    delete process.env.DEPTH4_INGEST_CRON_SECRET;
    const c = resolveThesisExpandProxyConfig();
    expect(c.ok).toBe(false);
    if (!c.ok) {
      expect(c.error).toBe("api_proxy_misconfigured");
      expect(c.missing.length).toBeGreaterThanOrEqual(2);
    }
  });
});
