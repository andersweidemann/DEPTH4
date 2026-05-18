import { describe, expect, it } from "vitest";
import { buildReaderVisitorKey, utcViewDate } from "./visitor-key";
import { shouldRecordReaderView } from "./record";

describe("thesis-reader-analytics record policy", () => {
  const ctx = {
    userAgent: "Mozilla/5.0 Chrome/120",
    referer: "",
    forwardedFor: "203.0.113.10",
  };

  it("records human only via client beacon", () => {
    expect(
      shouldRecordReaderView({ thesisId: "t1", slug: "x", eventSource: "server_render" }, ctx),
    ).toBe(false);
    expect(
      shouldRecordReaderView({ thesisId: "t1", slug: "x", eventSource: "client_beacon" }, ctx),
    ).toBe(true);
  });

  it("records crawlers on server render only", () => {
    const botCtx = { ...ctx, userAgent: "Googlebot/2.1" };
    expect(
      shouldRecordReaderView({ thesisId: "t1", slug: "x", eventSource: "server_render" }, botCtx),
    ).toBe(true);
    expect(
      shouldRecordReaderView({ thesisId: "t1", slug: "x", eventSource: "client_beacon" }, botCtx),
    ).toBe(false);
  });

  it("stable visitor key for same day and token", () => {
    const date = "2026-05-16";
    const a = buildReaderVisitorKey({
      thesisId: "th-1",
      viewDateUtc: date,
      ipBucket: "abc",
      userAgent: ctx.userAgent,
      deviceClass: "desktop",
      clientVisitorToken: "token-xyz",
    });
    const b = buildReaderVisitorKey({
      thesisId: "th-1",
      viewDateUtc: date,
      ipBucket: "different",
      userAgent: "Other UA",
      deviceClass: "mobile",
      clientVisitorToken: "token-xyz",
    });
    expect(a).toBe(b);
  });

  it("different visitor keys across UTC days", () => {
    const token = "token-xyz";
    const k1 = buildReaderVisitorKey({
      thesisId: "th-1",
      viewDateUtc: "2026-05-16",
      ipBucket: "a",
      userAgent: ctx.userAgent,
      deviceClass: "desktop",
      clientVisitorToken: token,
    });
    const k2 = buildReaderVisitorKey({
      thesisId: "th-1",
      viewDateUtc: "2026-05-17",
      ipBucket: "a",
      userAgent: ctx.userAgent,
      deviceClass: "desktop",
      clientVisitorToken: token,
    });
    expect(k1).not.toBe(k2);
    expect(utcViewDate(new Date("2026-05-16T23:00:00Z"))).toBe("2026-05-16");
  });
});
