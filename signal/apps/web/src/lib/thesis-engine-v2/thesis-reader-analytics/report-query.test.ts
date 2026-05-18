import { describe, expect, it } from "vitest";
import {
  filterReaderAnalyticsTheses,
  sortReaderAnalyticsTheses,
  type ThesisReaderAnalyticsRow,
} from "./report-query";

function row(partial: Partial<ThesisReaderAnalyticsRow> & { thesisId: string; slug: string }): ThesisReaderAnalyticsRow {
  return {
    title: null,
    readerPublicEnabled: true,
    humanViews: 0,
    humanUniqueVisitors: 0,
    crawlerViews: 0,
    previewViews: 0,
    lastViewedAt: null,
    topSources: [],
    ...partial,
  };
}

describe("reader analytics report-query", () => {
  const rows = [
    row({
      thesisId: "a",
      slug: "alpha-thesis",
      title: "Alpha",
      humanViews: 10,
      lastViewedAt: "2026-05-10T00:00:00Z",
    }),
    row({
      thesisId: "b",
      slug: "beta-long",
      title: "Beta",
      humanViews: 50,
      lastViewedAt: "2026-05-20T00:00:00Z",
    }),
  ];

  it("filters by slug or title", () => {
    expect(filterReaderAnalyticsTheses(rows, "beta")).toHaveLength(1);
    expect(filterReaderAnalyticsTheses(rows, "Alpha")).toHaveLength(1);
    expect(filterReaderAnalyticsTheses(rows, "nope")).toHaveLength(0);
  });

  it("sorts by human views", () => {
    const sorted = sortReaderAnalyticsTheses(rows, "humanViews");
    expect(sorted[0]?.slug).toBe("beta-long");
  });

  it("sorts by recent / last viewed", () => {
    const sorted = sortReaderAnalyticsTheses(rows, "recent");
    expect(sorted[0]?.slug).toBe("beta-long");
  });
});
