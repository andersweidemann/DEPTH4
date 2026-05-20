import { redirect } from "next/navigation";

/** Legacy URL — canonical risk disclosure lives at `/risk`. */
export default function RiskDisclosureRedirectPage() {
  redirect("/risk");
}
