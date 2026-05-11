/**
 * When true, anonymous visitors can load DEPTH4 workspace routes and read-only APIs without signing in.
 * **Admin** (`/admin`, `/api/admin`) stays protected. **User** APIs (`/api/user/*`) still require auth.
 *
 * Set on the server: `DEPTH4_PUBLIC_READ_MODE=1` (Vercel / `.env.local`).
 * Optional: `NEXT_PUBLIC_DEPTH4_PUBLIC_READ_MODE=1` (exposes flag to the client bundle — avoid if you can use server-only).
 *
 * **Turn off** after external review or crawls.
 */
export function isDepth4PublicReadMode(): boolean {
  return (
    process.env.DEPTH4_PUBLIC_READ_MODE === "1" || process.env.NEXT_PUBLIC_DEPTH4_PUBLIC_READ_MODE === "1"
  );
}
