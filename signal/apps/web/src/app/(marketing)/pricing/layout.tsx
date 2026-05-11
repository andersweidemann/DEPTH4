import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "DEPTH4 — Pricing",
  description: "Plans and pricing for DEPTH4.",
};

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
