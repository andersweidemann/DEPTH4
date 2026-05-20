import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "DEPTH4 · Risk Disclosure",
  description: "Risk disclosure and educational notice for DEPTH4 macro research.",
};

export default function RiskDisclosurePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 text-zinc-300">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Risk Disclosure</h1>

      <p className="mt-6 text-[14px] leading-relaxed text-zinc-400">
        DEPTH4 is a macro intelligence research platform. It does not provide investment advice.
      </p>

      <section className="mt-8 space-y-4 text-[14px] leading-relaxed">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          What DEPTH4 does
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-zinc-300">
          <li>Reads news and generates research hypotheses about macro trends</li>
          <li>Tracks how events might affect asset prices</li>
          <li>Surfaces what the market may be under- or over-pricing</li>
        </ul>
      </section>

      <section className="mt-8 space-y-4 text-[14px] leading-relaxed">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          What DEPTH4 does NOT do
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-zinc-300">
          <li>Recommend specific trades or timing</li>
          <li>Guarantee accuracy of predictions</li>
          <li>Replace your own research or judgment</li>
          <li>Function as a broker or financial advisor</li>
        </ul>
      </section>

      <p className="mt-8 text-[14px] leading-relaxed text-zinc-400">
        All thesis probabilities, trade plans, and scenario analysis are AI-generated research outputs. They
        represent probabilistic views, not recommendations.
      </p>

      <p className="mt-4 text-[14px] leading-relaxed text-zinc-400">
        You are solely responsible for any investment decisions you make. Past performance of DEPTH4 theses does
        not guarantee future results.
      </p>

      <p className="mt-10">
        <Link
          href="/theses"
          className="inline-flex min-h-10 items-center rounded-md border border-white/[0.08] bg-white/[0.04] px-4 text-[13px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] hover:text-zinc-50"
        >
          Back to Theses
        </Link>
      </p>
    </div>
  );
}
