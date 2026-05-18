import type { ReaderSourceBucket } from "@/lib/thesis-engine-v2/thesis-reader-analytics/classify";

export type ReaderAnalyticsSort = "humanViews" | "lastViewed" | "recent";

export type ThesisReaderAnalyticsRow = {
  thesisId: string;
  slug: string;
  title: string | null;
  readerPublicEnabled: boolean;
  humanViews: number;
  humanUniqueVisitors: number;
  crawlerViews: number;
  previewViews: number;
  lastViewedAt: string | null;
  topSources: { bucket: ReaderSourceBucket | string; count: number }[];
};

export function filterReaderAnalyticsTheses(
  rows: ThesisReaderAnalyticsRow[],
  query: string,
): ThesisReaderAnalyticsRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((t) => {
    const slug = t.slug.toLowerCase();
    const title = (t.title ?? "").toLowerCase();
    return slug.includes(q) || title.includes(q);
  });
}

export function sortReaderAnalyticsTheses(
  rows: ThesisReaderAnalyticsRow[],
  sort: ReaderAnalyticsSort,
): ThesisReaderAnalyticsRow[] {
  const copy = [...rows];
  if (sort === "lastViewed" || sort === "recent") {
    copy.sort((a, b) => {
      const ta = a.lastViewedAt ? Date.parse(a.lastViewedAt) : 0;
      const tb = b.lastViewedAt ? Date.parse(b.lastViewedAt) : 0;
      return tb - ta;
    });
    return copy;
  }
  copy.sort((a, b) => b.humanViews - a.humanViews);
  return copy;
}
