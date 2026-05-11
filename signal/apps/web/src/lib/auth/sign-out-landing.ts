/**
 * Where the **server** sends the browser after `POST /auth/sign-out`
 * (SSR Supabase `signOut` + cookie clearing via `NextResponse` cookie jar).
 *
 * Use the **marketing / welcome** page — not `/login` — so logged-out users
 * see the public landing and can choose “Sign in” from there.
 */
export const AUTH_POST_SIGN_OUT_PATH = "/" as const;

/** Absolute URL for the post–sign-out redirect (same origin as the incoming request). */
export function authPostSignOutUrl(requestUrl: string): URL {
  return new URL(AUTH_POST_SIGN_OUT_PATH, requestUrl);
}
