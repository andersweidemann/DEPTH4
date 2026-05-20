import type { Metadata } from "next";
import Link from "next/link";
import { RiskDisclosureAcknowledgment } from "@/components/compliance/RiskDisclosureAcknowledgment";

export const metadata: Metadata = {
  title: "DEPTH4 · Risk Disclosure",
  description:
    "Risk disclosure and educational notice for DEPTH4 — macro research, AI-generated theses, and limitations of liability.",
};

const EFFECTIVE = "May 19, 2026";
const VERSION = "v1.0";

export default function RiskDisclosurePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-20 pt-12 text-zinc-300">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
        Risk Disclosure &amp; Educational Notice
      </h1>
      <p className="mt-2 text-[13px] text-zinc-500">
        Effective date: {EFFECTIVE} · {VERSION}
      </p>

      <div className="mt-8 space-y-8 text-[14px] leading-relaxed">
        <p className="text-zinc-400">
          DEPTH4 is a macro intelligence research platform. This page explains what the product does, what it does not
          do, and the risks of relying on AI-generated research. Please read it before using theses, feed, positions, or
          track record features.
        </p>

        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E8473F]/90">
            What DEPTH4 does
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-zinc-300">
            <li>
              Reads and processes news and macro narratives through an automated pipeline (event detection, incentive
              analysis, causal propagation, and thesis generation).
            </li>
            <li>
              Surfaces <strong className="font-medium text-zinc-200">research hypotheses</strong> about how stories may
              cascade through markets — with probabilities, mispricing estimates, scenario paths, and evidence links.
            </li>
            <li>
              Tracks theses as new headlines arrive, including conviction shifts, trade-plan context, and
              &quot;what changed&quot; summaries on the feed.
            </li>
            <li>
              Lets you star theses, hide items from your view, and create <strong className="font-medium text-zinc-200">personal overlay theses</strong> that receive the same analytical treatment as AI-generated rows.
            </li>
            <li>
              Organizes theses by macro events and causal clusters so you can see related assets and implied effects —
              not isolated headlines.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            What DEPTH4 does NOT do
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-zinc-300">
            <li>Provide personalized investment advice or recommendations tailored to your financial situation.</li>
            <li>Act as a broker, dealer, exchange, custodian, or registered investment adviser or fiduciary.</li>
            <li>Execute trades, hold funds, or manage portfolios on your behalf.</li>
            <li>Guarantee the accuracy, completeness, or timeliness of any thesis, probability, or price level.</li>
            <li>Replace your own research, risk management, tax planning, or legal counsel.</li>
            <li>
              Delegate core intelligence to manual headline browsing — the engine is designed to produce analyzed output,
              not raw wire copy as the primary product.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            AI-generated content
          </h2>
          <p className="text-zinc-400">
            Theses, scenario probabilities, trade-plan fields, resolution paths, feed interpretations, and assistant
            replies are produced or assisted by large language models and automated rules. They are{" "}
            <strong className="font-medium text-zinc-200">probabilistic research outputs</strong>, not facts or
            instructions.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-zinc-300">
            <li>
              Copy is written in research language (e.g. &quot;may,&quot; &quot;suggests,&quot; &quot;if the thesis
              holds&quot;) — not as buy/sell commands.
            </li>
            <li>
              Probabilities and mispricing scores are model estimates. They can be wrong, stale, or based on incomplete
              sources.
            </li>
            <li>
              Evidence timelines may combine pipeline-stored excerpts and live log entries; always verify material
              claims against primary sources.
            </li>
            <li>
              User-created theses are your content; DEPTH4 may analyze and display them under your account settings, but
              they are not endorsed as correct by DEPTH4.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Investment risks
          </h2>
          <p className="text-zinc-400">
            All investing and trading involve risk of loss, including the possible loss of principal. Markets can move
            sharply on news, liquidity, policy, and positioning — especially in macro, rates, FX, commodities, and
            crypto. A thesis that looked well-reasoned yesterday can be invalidated by a single headline today.
          </p>
          <p className="text-zinc-400">
            Past performance of DEPTH4 theses, win rates on the track record, or historical scenario outcomes{" "}
            <strong className="font-medium text-zinc-200">do not guarantee</strong> future results.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Limitation of liability
          </h2>
          <p className="text-zinc-400">
            To the fullest extent permitted by applicable law, DEPTH4 and its operators, affiliates, and suppliers
            disclaim all liability for any loss or damage arising from your use of the platform, including losses from:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-zinc-300">
            <li>Reliance on any thesis, probability, trade-plan field, feed item, or assistant message.</li>
            <li>Errors, omissions, delays, or interruptions in data, models, or third-party news sources.</li>
            <li>Actions you take (or fail to take) in financial markets based on platform content.</li>
          </ul>
          <p className="text-zinc-400">
            The platform is provided on an <strong className="font-medium text-zinc-200">&quot;as is&quot;</strong> and{" "}
            <strong className="font-medium text-zinc-200">&quot;as available&quot;</strong> basis without warranties of
            any kind, whether express or implied.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Your responsibility
          </h2>
          <p className="text-zinc-400">
            You are solely responsible for evaluating information on DEPTH4 and for any investment or trading
            decisions you make. Consult qualified financial, tax, and legal professionals before acting. Use only capital
            you can afford to lose, and size positions according to your own risk limits.
          </p>
        </section>

        <section className="space-y-3 rounded-lg border border-[#E8473F]/20 bg-[#E8473F]/5 p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E8473F]">
            Summary
          </h2>
          <p className="text-zinc-200">
            DEPTH4 provides macro analysis, not financial advice. All theses are AI-generated or AI-assisted research
            hypotheses. Always conduct your own due diligence before making investment decisions.
          </p>
        </section>

        <section className="space-y-2 border-t border-white/[0.06] pt-6">
          <p className="text-[13px] text-zinc-500">
            This notice supplements our other policies. For contractual terms governing use of the service, see{" "}
            <Link href="/terms" className="text-[#E8473F] underline-offset-2 hover:underline">
              Terms of Use
            </Link>
            . For a short-form financial disclaimer, see{" "}
            <Link href="/disclaimer" className="text-[#E8473F] underline-offset-2 hover:underline">
              Investment Disclaimer
            </Link>
            .
          </p>
          <p className="text-[12px] text-zinc-600">
            Draft for product use — have qualified counsel review for your jurisdiction before public launch.
          </p>
        </section>

        <RiskDisclosureAcknowledgment />

        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/theses"
            className="inline-flex min-h-10 items-center rounded-md border border-white/[0.08] bg-white/[0.04] px-4 text-[13px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] hover:text-zinc-50"
          >
            Back to Theses
          </Link>
          <Link
            href="/terms"
            className="inline-flex min-h-10 items-center rounded-md border border-[#E8473F]/30 bg-[#E8473F]/10 px-4 text-[13px] font-medium text-[#E8473F] transition-colors hover:bg-[#E8473F]/20"
          >
            Terms of Use
          </Link>
        </div>
      </div>
    </main>
  );
}
