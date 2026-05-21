const RESERVED_THESIS_SEGMENTS = new Set(["debug", "archive"]);

/**
 * Thesis map + detail readable without login (read-only UI for anonymous visitors).
 */
export function isAlwaysPublicThesisPath(pathname: string): boolean {
  const p = (pathname.split("?")[0] ?? pathname).replace(/\/$/, "") || "/";
  if (p === "/theses" || p === "/theses/archive") return true;
  const detail = /^\/theses\/([^/]+)$/.exec(p);
  if (detail) {
    const seg = detail[1]!;
    return !RESERVED_THESIS_SEGMENTS.has(seg);
  }
  return /^\/theses\/[^/]+\/read(?:\/opengraph-image)?\/?$/.test(p);
}

/** Read-only news APIs (sources list, headlines) — no write. */
export function isPublicNewsReadApiPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  return p === "/api/news/sources" || p === "/api/news/headlines";
}

/**
 * Workspace pages that always render without login (each page handles auth for writes).
 * Not gated on DEPTH4_PUBLIC_READ_MODE — prevents RouteGuard/middleware hang on navigation.
 */
export function isAlwaysPublicWorkspacePath(pathname: string): boolean {
  const p = (pathname.split("?")[0] ?? pathname).replace(/\/$/, "") || "/";
  return (
    p === "/sources" ||
    p === "/submit-news" ||
    p === "/help" ||
    p === "/community" ||
    p === "/leaderboard"
  );
}

/** APIs required to hydrate public thesis detail and causal map. */
export function isAlwaysPublicThesisApiPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  if (p === "/api/theses") return true;
  if (p.startsWith("/api/theses/catalog-titles")) return true;
  if (/^\/api\/theses\/[^/]+\/bundle\/?$/.test(p)) return true;
  if (p === "/api/causal-graph/clusters" || p.startsWith("/api/causal-graph/")) return true;
  if (p === "/api/help") return true;
  if (isPublicNewsReadApiPath(pathname)) return true;
  return false;
}

/**
 * Workspace routes that stay readable when `DEPTH4_PUBLIC_READ_MODE=1`.
 * Middleware and client `RouteGuard` must agree on this list.
 */
export function isPublicReadWorkspacePath(pathname: string): boolean {
  const p = (pathname.split("?")[0] ?? pathname).replace(/\/$/, "") || "/";
  if (p === "/feed" || p.startsWith("/feed/")) return true;
  if (p === "/sources" || p === "/submit-news") return true;
  if (p === "/community" || p === "/leaderboard" || p === "/help") return true;
  if (isAlwaysPublicThesisPath(pathname)) return true;
  return false;
}

export function isDepth4PublicReadModeClient(): boolean {
  return process.env.NEXT_PUBLIC_DEPTH4_PUBLIC_READ_MODE === "1";
}
