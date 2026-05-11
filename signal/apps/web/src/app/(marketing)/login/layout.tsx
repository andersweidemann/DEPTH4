import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "DEPTH4 — Log in",
  description: "Sign in to DEPTH4.",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
