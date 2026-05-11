import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DEPTH4 — Risk Disclosure",
  description: "Risk Disclosure and Educational Notice.",
};

export default function RiskDisclosurePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Risk Disclosure</h1>
      <p className="mt-4 text-[14px] leading-relaxed text-zinc-300">[Risk disclosure content placeholder]</p>
    </div>
  );
}
