import { authFetch } from "@/lib/api";
import { HttpError, NetworkError } from "@/lib/http-error";

/** Default SWR fetcher: GET JSON with Bearer via `authFetch`. */
export async function swrJsonFetcher<T = unknown>(url: string): Promise<T> {
  try {
    const r = await authFetch(url);
    if (!r.ok) throw new HttpError(r.status);
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof TypeError) throw new NetworkError();
    throw e;
  }
}
