/** Bot / preview UA classification for public reader analytics (Phase 4D). */

const PREVIEW_UA =
  /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|Embedly|Preview|vkShare|bingpreview/i;

const CRAWLER_UA =
  /bot|crawl|spider|slurp|mediapartners|Googlebot|Bingbot|DuckDuckBot|YandexBot|Applebot|GPTBot|Claude-Web|anthropic-ai|Bytespider|petalbot/i;

export type ReaderVisitorKind = "human" | "crawler" | "preview";

export function classifyReaderUserAgent(userAgent: string | null | undefined): ReaderVisitorKind {
  const ua = (userAgent ?? "").trim();
  if (!ua) return "human";
  if (PREVIEW_UA.test(ua)) return "preview";
  if (CRAWLER_UA.test(ua)) return "crawler";
  return "human";
}

export type ReaderDeviceClass = "mobile" | "desktop" | "unknown";

export function classifyReaderDevice(userAgent: string | null | undefined): ReaderDeviceClass {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return "unknown";
  if (/mobile|android|iphone|ipad|ipod|webos|blackberry/i.test(ua)) return "mobile";
  return "desktop";
}

export type ReaderSourceBucket = "direct" | "slack" | "linkedin" | "x" | "search" | "other" | "unknown";

export function normalizeReaderSourceBucket(referrer: string | null | undefined): ReaderSourceBucket {
  const raw = (referrer ?? "").trim();
  if (!raw) return "direct";
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    if (!host) return "unknown";
    if (host.includes("slack.com")) return "slack";
    if (host.includes("linkedin.com") || host === "lnkd.in") return "linkedin";
    if (host === "t.co" || host === "x.com" || host.includes("twitter.com")) return "x";
    if (host.includes("google.") || host.includes("bing.com") || host.includes("duckduckgo.com")) return "search";
    if (host === "depth4.com" || host.endsWith(".depth4.com")) return "direct";
    return "other";
  } catch {
    return "unknown";
  }
}

export function referrerHost(referrer: string | null | undefined): string | null {
  const raw = (referrer ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().slice(0, 253) || null;
  } catch {
    return null;
  }
}
