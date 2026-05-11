import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "DEPTH4 · Risk Disclosure",
  description: "Risk Disclosure and Educational Notice.",
};

export default function RiskDisclosurePage() {
  redirect("/risk-disclosure");
}

