import { safeAppPath } from "@/lib/app-paths";
import { redirect } from "next/navigation";

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

function pickString(v: string | string[] | undefined) {
  if (typeof v === "string" && v.length > 0) return v;
  if (Array.isArray(v) && v[0]) return v[0]!;
  return "";
}

/**
 * /signup and /login are the same auth flow. We send ?intent=signup for clearer copy.
 * Example: <Link href="/signup?next=/onboarding" />
 */
export default function SignupPage({ searchParams }: Props) {
  const next = safeAppPath(pickString(searchParams.next) || "/dashboard");
  const q = new URLSearchParams();
  q.set("intent", "signup");
  q.set("next", next);
  redirect("/login?" + q.toString());
}
