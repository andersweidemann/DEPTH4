/**
 * Workspace routes that stay readable when `DEPTH4_PUBLIC_READ_MODE=1`.
 * Middleware and client `RouteGuard` must agree on this list.
 */
export function isPublicReadWorkspacePath(pathname: string): boolean {
  const p = (pathname.split("?")[0] ?? pathname).replace(/\/$/, "") || "/";
  if (p === "/feed" || p.startsWith("/feed/")) return true;
  if (p === "/theses" || p.startsWith("/theses/")) return true;
  return false;
}

export function isDepth4PublicReadModeClient(): boolean {
  return process.env.NEXT_PUBLIC_DEPTH4_PUBLIC_READ_MODE === "1";
}
