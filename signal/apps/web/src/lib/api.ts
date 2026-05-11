/** Same-origin when empty. Override when the API is hosted elsewhere. */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function mergeHeaders(base: Headers, extra?: HeadersInit): Headers {
  const out = new Headers(base);
  if (!extra) return out;
  const h = new Headers(extra);
  h.forEach((v, k) => out.set(k, v));
  return out;
}

/**
 * Authenticated fetch for browser calls. Sends Bearer token from storage and redirects on 401.
 * Client-only (uses window).
 */
export async function authFetch(path: string, options?: RequestInit): Promise<Response> {
  if (typeof window === "undefined") {
    throw new Error("authFetch must run in the browser");
  }

  const token = localStorage.getItem("depth4_token") || sessionStorage.getItem("depth4_token");

  const baseHeaders = new Headers();
  const method = (options?.method ?? "GET").toUpperCase();
  const hasBody = options?.body != null && method !== "GET" && method !== "HEAD";
  if (hasBody && !(options?.body instanceof FormData) && !new Headers(options?.headers).has("Content-Type")) {
    baseHeaders.set("Content-Type", "application/json");
  }
  if (token) {
    baseHeaders.set("Authorization", `Bearer ${token}`);
  }

  const headers = mergeHeaders(baseHeaders, options?.headers);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: options?.credentials ?? "include",
  });

  if (res.status === 401) {
    localStorage.removeItem("depth4_token");
    sessionStorage.removeItem("depth4_token");
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `/login?next=${encodeURIComponent(currentPath)}`;
    throw new Error("Unauthorized");
  }

  return res;
}
