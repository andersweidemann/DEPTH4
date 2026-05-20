import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { cronAuthMatches, parseCronAuthHeaders } from "@/lib/cron-auth";

const SECRET = "C8/WFDsOe/4XVfv9vrFZeuiuV5G/708NRtbQ9aCOm8s=";

describe("cron-auth", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    delete process.env.INSIDER_FLOW_CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.INSIDER_FLOW_CRON_SECRET;
  });

  it("accepts Authorization Bearer", () => {
    const req = new NextRequest("https://depth4.com/api/cron/test", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(cronAuthMatches(req, [SECRET])).toBe(true);
    expect(parseCronAuthHeaders(req).parsedBearerPrefixOk).toBe(true);
  });

  it("accepts Authorization raw token without Bearer (cron-job.org)", () => {
    const req = new NextRequest("https://depth4.com/api/cron/test", {
      headers: { Authorization: SECRET },
    });
    const h = parseCronAuthHeaders(req);
    expect(h.authorizationTreatedAsRawToken).toBe(true);
    expect(cronAuthMatches(req, [SECRET])).toBe(true);
  });

  it("accepts x-insider-flow-secret", () => {
    const req = new NextRequest("https://depth4.com/api/cron/test", {
      headers: { "x-insider-flow-secret": SECRET },
    });
    expect(cronAuthMatches(req, [SECRET])).toBe(true);
  });

  it("accepts x-cron-secret", () => {
    const req = new NextRequest("https://depth4.com/api/cron/test", {
      headers: { "x-cron-secret": SECRET },
    });
    expect(cronAuthMatches(req, [SECRET])).toBe(true);
  });

  it("rejects wrong secret", () => {
    const req = new NextRequest("https://depth4.com/api/cron/test", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(cronAuthMatches(req, [SECRET])).toBe(false);
  });
});
