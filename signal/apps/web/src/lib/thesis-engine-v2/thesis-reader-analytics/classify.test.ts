import { describe, expect, it } from "vitest";
import {
  classifyReaderUserAgent,
  normalizeReaderSourceBucket,
  referrerHost,
} from "./classify";

describe("thesis-reader-analytics classify", () => {
  it("detects preview bots", () => {
    expect(classifyReaderUserAgent("facebookexternalhit/1.1")).toBe("preview");
    expect(classifyReaderUserAgent("Slackbot-LinkExpanding 1.0")).toBe("preview");
  });

  it("detects crawlers", () => {
    expect(classifyReaderUserAgent("Googlebot/2.1")).toBe("crawler");
  });

  it("treats normal browsers as human", () => {
    expect(
      classifyReaderUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("human");
  });

  it("normalizes referrer buckets", () => {
    expect(normalizeReaderSourceBucket(null)).toBe("direct");
    expect(normalizeReaderSourceBucket("https://www.linkedin.com/feed/")).toBe("linkedin");
    expect(normalizeReaderSourceBucket("https://t.co/abc")).toBe("x");
    expect(normalizeReaderSourceBucket("https://hooks.slack.com/")).toBe("slack");
  });

  it("extracts referrer host", () => {
    expect(referrerHost("https://news.ycombinator.com/item")).toBe("news.ycombinator.com");
  });
});
