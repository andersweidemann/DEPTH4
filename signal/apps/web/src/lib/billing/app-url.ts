/** Canonical site origin for Stripe redirect URLs. */
export function billingAppOrigin(req?: Request): string {
  const fromEnv = (process.env.NEXT_PUBLIC_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (req) {
    try {
      return new URL(req.url).origin;
    } catch {
      // ignore
    }
  }
  return "http://localhost:3000";
}
