import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DEPTH4 · Risk Disclosure",
  description: "Risk Disclosure and Educational Notice.",
};

export default function RiskDisclosurePage() {
  const effective = "May 6, 2026";
  const version = "v0.1 (draft)";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-12 text-zinc-100">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">DEPTH4</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Risk Disclosure</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Effective date: {effective} · {version}
      </p>

      <div className="prose prose-invert mt-10 max-w-none prose-p:text-zinc-300 prose-li:text-zinc-300 prose-headings:text-zinc-100">
        <h2>1. Trading risks</h2>
        <ul>
          <li>Trading involves substantial risk of loss.</li>
          <li>You can lose more than your initial investment (especially with leverage, margin, or derivatives).</li>
          <li>Only trade with money you can afford to lose completely.</li>
        </ul>

        <h2>2. Past performance</h2>
        <ul>
          <li>Past performance is not indicative of future results.</li>
          <li>Historical data does not guarantee future outcomes.</li>
          <li>Market conditions change and can invalidate prior patterns.</li>
        </ul>

        <h2>3. DEPTH4 analysis limitations</h2>
        <ul>
          <li>AI and algorithmic analysis may be incomplete, incorrect, or outdated.</li>
          <li>News interpretation may miss context, be delayed, or contain errors.</li>
          <li>Probability scores are estimates, not predictions or guarantees.</li>
          <li>Thesis frameworks are analytical tools, not assurances of results.</li>
        </ul>

        <h2>4. Professional advice</h2>
        <ul>
          <li>DEPTH4 does not provide personalized investment advice.</li>
          <li>Consult a licensed financial professional before trading if needed.</li>
          <li>Consider your personal circumstances, objectives, and risk tolerance.</li>
          <li>Understand the risks of any product or asset before proceeding.</li>
        </ul>

        <h2>5. User responsibility</h2>
        <ul>
          <li>You are solely responsible for your trading outcomes.</li>
          <li>DEPTH4 provides tools and information, not advice.</li>
          <li>Verify information independently before acting on it.</li>
        </ul>

        <hr />
        <p className="text-zinc-400">
          This document is a draft template for pre-launch use and must be reviewed by counsel for your jurisdiction.
        </p>
      </div>
    </main>
  );
}

