# Google OAuth — manual verification (DEPTH4)

Use after changing auth routes, Supabase redirect URLs, or `lib/supabase/server.ts` cookie handling.

## Supabase + Google console (production)

1. **Supabase Dashboard → Authentication → URL configuration**
   - **Site URL**: canonical app origin (e.g. `https://depth4.com` or `https://www.depth4.com` — pick one and stick to it).
   - **Redirect URLs**: must include the exact callback used by the app:
     - `https://<your-host>/auth/callback`
     - Optionally `https://<your-host>/api/auth/callback` (alias redirects to `/auth/callback`).

2. **Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs**
   - Must include Supabase’s redirect, e.g. `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase shows the exact value).

3. **Vercel (or host) env**
   - `NEXT_PUBLIC_SUPABASE_URL` — `https://<project-ref>.supabase.co` (HTTPS, `.supabase.co`).
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — JWT anon key (no `Bearer ` prefix, no stray quotes).

## In-browser flow

1. Open `/login` on **production** (same host as in Supabase Redirect URLs).
2. Click **Continue with Google** (full navigation to `/api/auth/google?next=…`).
3. Complete Google consent; you should land on `/auth/callback?code=…&next=…` briefly, then redirect to `/theses` (or `next`).
4. Confirm you stay signed in (no bounce back to `/login`).
5. **Hard refresh** (⌘⇧R / Ctrl+Shift+R); you should still be authenticated.
6. **Logout** from the app; confirm you return to marketing home and `/theses` sends you to login again.

## What the app sends vs expects

- **OAuth `redirectTo`**: `{origin}/auth/callback?next={encodeURIComponent(safeAppPath)}` from `GET /api/auth/google` (`signal/apps/web/src/app/api/auth/google/route.ts`).
- **Callback handler**: `GET /auth/callback` exchanges `code` and sets session cookies (`signal/apps/web/src/app/auth/callback/route.ts`).
- **Alias**: `GET /api/auth/callback` → 302 to `/auth/callback` with the same query string (`signal/apps/web/src/app/api/auth/callback/route.ts`).

`origin` is derived from the incoming request URL; mismatched **www** vs apex between Supabase Site URL and where users open the app causes cookie/session issues — keep them aligned.
