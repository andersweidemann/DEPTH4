/** Curated RSS / wire sources DEPTH4 ingests (mirrors signal_api default_rss_feeds). */
export const KNOWN_NEWS_SOURCES = [
  { id: "reuters-top", name: "Reuters", feedUrl: "https://feeds.reuters.com/reuters/topNews" },
  { id: "reuters-business", name: "Reuters Business", feedUrl: "https://feeds.reuters.com/reuters/businessNews" },
  { id: "ft", name: "Financial Times", feedUrl: "https://www.ft.com/?format=rss" },
  { id: "bloomberg", name: "Bloomberg", feedUrl: "https://feeds.bloomberg.com/markets/news.rss" },
  { id: "aljazeera", name: "Al Jazeera", feedUrl: "https://www.aljazeera.com/xml/rss/all.xml" },
  { id: "seeking-alpha", name: "Seeking Alpha", feedUrl: "https://seekingalpha.com/feed.xml" },
  { id: "wsj", name: "Wall Street Journal", feedUrl: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml" },
  { id: "cnbc", name: "CNBC", feedUrl: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114" },
] as const;

export function normalizeSourceLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "Wire";
  const lower = s.toLowerCase();
  if (lower.includes("reuters")) return "Reuters";
  if (lower.includes("financial times") || lower === "ft") return "Financial Times";
  if (lower.includes("bloomberg")) return "Bloomberg";
  if (lower.includes("wall street") || lower === "wsj") return "Wall Street Journal";
  if (lower.includes("cnbc")) return "CNBC";
  if (lower.includes("al jazeera")) return "Al Jazeera";
  if (lower.includes("seeking alpha")) return "Seeking Alpha";
  return s.length > 48 ? `${s.slice(0, 45)}…` : s;
}

export function matchKnownSourceId(sourceLabel: string): string | null {
  const label = normalizeSourceLabel(sourceLabel).toLowerCase();
  for (const src of KNOWN_NEWS_SOURCES) {
    if (label.includes(src.name.toLowerCase())) return src.id;
  }
  return null;
}
