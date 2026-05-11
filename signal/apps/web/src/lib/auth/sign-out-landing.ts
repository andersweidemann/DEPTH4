/**
 * Where the **server** sends the browser after `POST /auth/sign-out`
 * (SSR Supabase `signOut` + cookie clearing via `NextResponse` cookie jar).
 *
 * **Default:** same origin as the request + `/` — always the marketing `app/page.tsx`
 * for this deployment (local, preview, production domain). Hardcoding another host
 * (e.g. only production marketing) produced blank pages when that host did not
 * serve this app’s welcome route.
 *
 * **Optional:** set `NEXT_PUBLIC_POST_SIGN_OUT_ORIGIN` to a full origin
 * (e.g. `https://depth4.com`) — path is ignored; users land on `/` there.
 */
export const AUTH_POST_SIGN_OUT_PATH = "/" as const;

function resolvePostSignOutOrigin(requestUrl: string): string {
  const raw = process.env.NEXT_PUBLIC_POST_SIGN_OUT_ORIGIN?.trim();
  if (raw) {
    try {
      const normalized = raw.replace(/\/$/, "");
      return new URL(normalized).origin;
    } catch {
      // fall through
    }
  }
  return new URL(requestUrl).origin;
}

/** Absolute URL for the post–sign-out redirect (welcome / marketing home). */
export function authPostSignOutUrl(requestUrl: string): URL {
  return new URL(AUTH_POST_SIGN_OUT_PATH, resolvePostSignOutOrigin(requestUrl));
}
