import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "DEPTH4 — Create account",
  description: "Create your DEPTH4 account.",
};

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
