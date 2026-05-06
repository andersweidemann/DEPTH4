import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DEPTH4 · Financial / Investment Disclaimer",
  description: "Short-form financial disclaimer used throughout DEPTH4.",
};

export default function DisclaimerPage() {
  const effective = "May 6, 2026";
  const version = "v0.1 (draft)";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-12 text-zinc-100">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">DEPTH4</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Financial / Investment Disclaimer</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Effective date: {effective} · {version}
      </p>

      <div className="prose prose-invert mt-10 max-w-none prose-p:text-zinc-300 prose-headings:text-zinc-100">
        <p>
          DEPTH4 is an informational platform providing macro event analysis and thesis tracking tools. We are not a
          broker, investment adviser, or financial planner. Content on this platform is for educational and
          informational purposes only and should not be construed as personalized investment advice or a recommendation
          to buy or sell any security or asset.
        </p>
        <p>
          All investment strategies and investments involve risk of loss. Nothing contained on this platform should be
          construed as investment advice. Any reference to an investment&apos;s past or potential performance is not, and
          should not be construed as, a recommendation or as a guarantee of any specific outcome or profit.
        </p>
        <p>
          Users are solely responsible for their own investment decisions and should consult qualified financial, tax,
          and legal professionals before making any investment. DEPTH4 makes no representations or warranties regarding
          the accuracy, completeness, or timeliness of any information on this platform.
        </p>

        <hr />
        <p className="text-zinc-400">
          This document is a draft template for pre-launch use and must be reviewed by counsel for your jurisdiction.
        </p>
      </div>
    </main>
  );
}

