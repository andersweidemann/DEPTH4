import { createHash } from "crypto";
import type { ReaderDeviceClass } from "@/lib/thesis-engine-v2/thesis-reader-analytics/classify";

function analyticsSalt(): string {
  return (process.env.THESIS_READER_ANALYTICS_SALT ?? "depth4-reader-analytics-v1").trim();
}

/** Coarse IP bucket — never store raw IP. IPv4 /24-style bucket via hashed prefix. */
export function coarseIpBucket(ip: string | null | undefined): string {
  const raw = (ip ?? "").trim();
  if (!raw) return "unknown";
  const first = raw.split(",")[0]?.trim() ?? raw;
  if (first.includes(":")) {
    const parts = first.split(":").filter(Boolean);
    const prefix = parts.slice(0, 4).join(":");
    return createHash("sha256").update(`${analyticsSalt()}:v6:${prefix}`).digest("hex").slice(0, 16);
  }
  const octets = first.split(".");
  if (octets.length === 4) {
    const prefix = `${octets[0]}.${octets[1]}.${octets[2]}`;
    return createHash("sha256").update(`${analyticsSalt()}:v4:${prefix}`).digest("hex").slice(0, 16);
  }
  return createHash("sha256").update(`${analyticsSalt()}:ip:${first}`).digest("hex").slice(0, 16);
}

function uaFamily(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (!ua) return "unknown";
  if (ua.includes("chrome") && !ua.includes("edg")) return "chrome";
  if (ua.includes("safari") && !ua.includes("chrome")) return "safari";
  if (ua.includes("firefox")) return "firefox";
  if (ua.includes("edg")) return "edge";
  return "other";
}

/**
 * Daily coarse visitor key — same browser/network tends to match within a UTC day.
 * Not a persistent cross-thesis identity.
 */
export function buildReaderVisitorKey(input: {
  thesisId: string;
  viewDateUtc: string;
  ipBucket: string;
  userAgent: string;
  deviceClass: ReaderDeviceClass;
  clientVisitorToken?: string | null;
}): string {
  const token =
    (input.clientVisitorToken ?? "").trim() ||
    `${input.ipBucket}:${uaFamily(input.userAgent)}:${input.deviceClass}`;
  const material = [
    analyticsSalt(),
    input.thesisId,
    input.viewDateUtc,
    token,
  ].join(":");
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

export function utcViewDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
