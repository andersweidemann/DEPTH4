import { describe, expect, it } from "vitest";
import {
  READER_ANALYTICS_RAW_RETENTION_DAYS,
  buildDailyAggregatesFromRawEvents,
  readerAnalyticsRetentionCutoffIso,
  type RawViewForRetention,
} from "./retention";

describe("reader analytics retention", () => {
  it("uses 180-day raw retention default", () => {
    expect(READER_ANALYTICS_RAW_RETENTION_DAYS).toBe(180);
  });

  it("computes cutoff from fixed now", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const cutoff = readerAnalyticsRetentionCutoffIso(now, 180);
    expect(cutoff).toBe("2025-12-03T12:00:00.000Z");
  });

  it("aggregates human, crawler, preview and sources per thesis/day", () => {
    const rows: RawViewForRetention[] = [
      {
        thesis_id: "t1",
        slug: "alpha",
        view_date: "2026-05-01",
        visitor_key: "k1",
        visitor_kind: "human",
        source_bucket: "slack",
        viewed_at: "2026-05-01T10:00:00Z",
      },
      {
        thesis_id: "t1",
        slug: "alpha",
        view_date: "2026-05-01",
        visitor_key: "k2",
        visitor_kind: "human",
        source_bucket: "slack",
        viewed_at: "2026-05-01T11:00:00Z",
      },
      {
        thesis_id: "t1",
        slug: "alpha",
        view_date: "2026-05-01",
        visitor_key: "bot",
        visitor_kind: "crawler",
        source_bucket: "direct",
        viewed_at: "2026-05-01T12:00:00Z",
      },
      {
        thesis_id: "t1",
        slug: "alpha",
        view_date: "2026-05-01",
        visitor_key: "p1",
        visitor_kind: "preview",
        source_bucket: "direct",
        viewed_at: "2026-05-01T13:00:00Z",
      },
    ];

    const agg = buildDailyAggregatesFromRawEvents(rows);
    expect(agg).toHaveLength(1);
    expect(agg[0]?.human_views).toBe(2);
    expect(agg[0]?.human_unique_visitors).toBe(2);
    expect(agg[0]?.crawler_views).toBe(1);
    expect(agg[0]?.preview_views).toBe(1);
    expect(agg[0]?.source_counts.slack).toBe(2);
  });
});
