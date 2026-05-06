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
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Risk Disclosure and Educational Notice</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Effective date: {effective} · {version}
      </p>

      <div className="prose prose-invert mt-10 max-w-none prose-p:text-zinc-300 prose-li:text-zinc-300 prose-headings:text-zinc-100">
        <h2>1. Trading and investment risks</h2>
        <ul>
          <li>All trading involves substantial risk of loss.</li>
          <li>You can lose more than your initial investment (especially with leverage, derivatives, or margin).</li>
          <li>Past performance does not guarantee future results.</li>
          <li>Market conditions can change rapidly and unpredictably.</li>
        </ul>

        <h2>2. No guarantees</h2>
        <ul>
          <li>DEPTH4 thesis probabilities are analytical estimates, not predictions.</li>
          <li>Thesis accuracy is not guaranteed.</li>
          <li>“Ready” (entry setup valid) does not mean “profitable”. Losses are possible.</li>
          <li>User track records and leaderboard rankings do not guarantee future success.</li>
        </ul>

        <h2>3. User responsibility</h2>
        <ul>
          <li>You are solely responsible for your trading and investment decisions.</li>
          <li>Consult qualified financial professionals before trading if needed.</li>
          <li>Only trade with capital you can afford to lose.</li>
          <li>Understand the risks of each asset class you trade.</li>
        </ul>

        <h2>4. AI-generated content limitations</h2>
        <ul>
          <li>AI analysis may be incomplete, inaccurate, or outdated.</li>
          <li>News events may be misinterpreted or missing key context.</li>
          <li>Probability estimates are subject to model and data limitations.</li>
          <li>Always verify information independently.</li>
        </ul>

        <h2>5. No professional relationship</h2>
        <ul>
          <li>DEPTH4 does not provide personalized investment advice.</li>
          <li>No fiduciary duty exists.</li>
          <li>Content is general analysis, not tailored to your situation.</li>
          <li>Do not rely solely on DEPTH4 for trading decisions.</li>
        </ul>

        <h2>6. Regulatory notice</h2>
        <ul>
          <li>Check local laws regarding trading and investment tools.</li>
          <li>Some features may not be available in your jurisdiction.</li>
          <li>You are responsible for tax reporting and compliance.</li>
        </ul>

        <hr />
        <p className="text-zinc-400">
          This document is a draft template for pre-launch use and must be reviewed by counsel for your jurisdiction.
        </p>
      </div>
    </main>
  );
}

