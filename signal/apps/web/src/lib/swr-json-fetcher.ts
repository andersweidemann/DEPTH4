import { authFetch } from "@/lib/api";

/** Default SWR fetcher: GET JSON with Bearer via `authFetch`. */
export function swrJsonFetcher<T = unknown>(url: string): Promise<T> {
  return authFetch(url).then((r) => {
    if (!r.ok) throw new Error(`Request failed (${r.status})`);
    return r.json() as Promise<T>;
  });
}
