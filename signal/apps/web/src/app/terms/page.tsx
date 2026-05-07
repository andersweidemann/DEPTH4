import type { Metadata } from "next";
import { PublicTopBar } from "@/components/brand/PublicTopBar";

export const metadata: Metadata = {
  title: "DEPTH4 · Terms of Use",
  description: "Terms governing use of DEPTH4.",
};

export default function TermsPage() {
  const effective = "May 6, 2026";
  const version = "v0.1 (draft)";

  return (
    <div className="min-h-dvh bg-[#0c0c0e] text-zinc-100">
      <PublicTopBar backHref="/" />
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 text-zinc-100">
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Terms of Use</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Effective date: {effective} · {version}
      </p>

      <div className="prose prose-invert mt-10 max-w-none prose-p:text-zinc-300 prose-li:text-zinc-300 prose-headings:text-zinc-100">
        <h2>1. Service description</h2>
        <p>
          DEPTH4 is an informational and educational platform. It provides tools for macro event analysis and thesis
          tracking. DEPTH4 is not a broker, not an investment adviser, and not a fiduciary. DEPTH4 does not provide
          personalized investment recommendations.
        </p>

        <h2>2. No investment advice</h2>
        <ul>
          <li>DEPTH4 does not provide personalized investment advice.</li>
          <li>Content is general information only and is not tailored to your circumstances.</li>
          <li>You are responsible for evaluating information and deciding what to do (if anything).</li>
        </ul>

        <h2>3. User responsibility</h2>
        <ul>
          <li>You assume all risk for your investing and trading activity.</li>
          <li>You are responsible for compliance with applicable laws and regulations.</li>
          <li>You are responsible for all trading decisions and risk management.</li>
        </ul>

        <h2>4. No guarantees</h2>
        <ul>
          <li>No guarantee of profit, performance, or results.</li>
          <li>Past performance is not indicative of future results.</li>
          <li>Analysis may be incomplete, incorrect, or outdated.</li>
          <li>Markets can be volatile and unpredictable.</li>
        </ul>

        <h2>5. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, DEPTH4 is not liable for trading losses or for any indirect,
          incidental, special, consequential, or punitive damages, or any loss of profits, data, or goodwill. DEPTH4 is
          not liable for errors or omissions in content. Use DEPTH4 at your own risk.
        </p>
        <p>
          To the extent DEPTH4 is found liable, our total liability for all claims in any 12-month period is limited to
          the subscription fees paid by you to DEPTH4 in the 12 months preceding the event giving rise to the claim.
        </p>

        <h2>6. User accounts</h2>
        <ul>
          <li>You must be at least 18 years old to use DEPTH4.</li>
          <li>You agree to provide accurate information and keep it up to date.</li>
          <li>You are responsible for maintaining the confidentiality of your account and access credentials.</li>
          <li>
            We may suspend or terminate accounts at any time if we believe there is misuse, fraud, security risk, or a
            violation of these Terms.
          </li>
          <li>One account per person (unless we explicitly approve otherwise).</li>
        </ul>

        <h2>7. Content and intellectual property</h2>
        <h3>7.1 DEPTH4 content</h3>
        <p>
          DEPTH4 and its underlying software, design, and system-generated content are owned by DEPTH4 or its licensors
          and are protected by intellectual property laws.
        </p>

        <h3>7.2 User-created theses</h3>
        <p>
          You retain ownership of theses and other content you create and submit to DEPTH4 (“User Content”). By posting
          or submitting User Content (including publishing theses), you grant DEPTH4 a worldwide, non-exclusive,
          royalty-free license to host, store, reproduce, display, and distribute your User Content within the DEPTH4
          service and to operate, improve, and market the service. You represent that you have the rights needed to
          grant this license.
        </p>

        <h3>7.3 Community rules</h3>
        <p>When you publish theses or participate in community features, you agree that you will not:</p>
        <ul>
          <li>Spam, manipulate, or attempt to game reputation, followers, or leaderboard rankings.</li>
          <li>Post misleading claims, fabricated track records, or content designed to deceive other users.</li>
          <li>Impersonate another person or entity.</li>
          <li>Present published theses as personalized financial advice to specific individuals.</li>
        </ul>

        <h2>8. Prohibited uses</h2>
        <ul>
          <li>Automated scraping, crawling, or data harvesting without our written permission.</li>
          <li>Attempting to reverse engineer, disrupt, or bypass security or access controls.</li>
          <li>Using DEPTH4 for any unlawful purpose or in violation of applicable laws and regulations.</li>
        </ul>

        <h2>9. Disclaimers</h2>
        <p>
          DEPTH4 content is provided for informational purposes only. We do not guarantee accuracy, completeness, or
          timeliness. You are solely responsible for your investment and trading decisions. DEPTH4 is not liable for
          trading losses. Past performance does not guarantee future results.
        </p>

        <h2>10. Subscription and billing</h2>
        <p>
          DEPTH4 may offer tiered subscriptions with different features. Subscriptions may renew automatically unless
          cancelled before the renewal date. Cancellation and refund rules (if any) will be described at the time of
          purchase or in your account settings.
        </p>

        <h2>11. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. We will provide notice for material changes. Continued use of
          DEPTH4 after an effective date constitutes acceptance of the updated Terms.
        </p>

        <h2>12. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of the jurisdiction where DEPTH4 is established, without regard to
          conflict of laws principles. Arbitration may be offered or required in certain jurisdictions; if used, the
          process and venue will be described in a final, reviewed version of these Terms.
        </p>

        <hr />
        <p className="text-zinc-400">
          This document is a draft template for pre-launch use and must be reviewed by counsel for your jurisdiction.
        </p>
      </div>
      </main>
    </div>
  );
}

