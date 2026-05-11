import type { Metadata } from "next";
import { PublicTopBar } from "@/components/brand/PublicTopBar";

export const metadata: Metadata = {
  title: "DEPTH4 · Privacy Policy",
  description: "How DEPTH4 collects and uses information.",
};

export default function PrivacyPage() {
  const effective = "May 6, 2026";
  const version = "v0.1 (draft)";

  return (
    <div className="min-h-dvh bg-[#0c0c0e] text-zinc-100">
      <PublicTopBar backHref="/" />
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 text-zinc-100">
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Effective date: {effective} · {version}
      </p>

      <div className="prose prose-invert mt-10 max-w-none prose-p:text-zinc-300 prose-li:text-zinc-300 prose-headings:text-zinc-100">
        <h2>1. Information we collect</h2>
        <ul>
          <li>
            <strong>Account information</strong> (such as email, name, and authentication identifiers).
          </li>
          <li>
            <strong>Thesis data</strong> (user-created theses, evidence items, and related notes).
          </li>
          <li>
            <strong>Usage data</strong> (pages viewed, features used, clicks, and feature interactions).
          </li>
          <li>
            <strong>Device/browser information</strong> (IP address, device type, browser type, approximate location,
            and diagnostic logs).
          </li>
          <li>
            <strong>Cookies and tracking</strong> (authentication and preferences; analytics where enabled).
          </li>
        </ul>

        <h2>2. How we use information</h2>
        <ul>
          <li>Provide and operate DEPTH4 services.</li>
          <li>Send thesis updates and alerts you request.</li>
          <li>Improve product features and user experience.</li>
          <li>Provide customer support and troubleshoot issues.</li>
          <li>Marketing communications (where permitted, with opt-out).</li>
        </ul>

        <h2>3. Information sharing</h2>
        <p>We may share information in the following cases:</p>
        <ul>
          <li>
            <strong>Service providers</strong> (for example: analysis providers, email providers, analytics services,
            hosting and infrastructure).
          </li>
          <li>
            <strong>Public user content</strong>: if you publish theses, certain content may be visible to others,
            including on community pages, leaderboards, and profiles.
          </li>
          <li>
            <strong>Legal requirements</strong>: subpoenas, court orders, or other lawful requests.
          </li>
          <li>
            <strong>Business transfers</strong>: acquisition, merger, or sale of assets.
          </li>
        </ul>
        <p>
          We do not sell your personal information to third parties.
        </p>

        <h2>4. Positions and your Book</h2>
        <p>
          When you are signed in, open positions and book-related state are stored in your account (for example in our
          database) so they persist across sign-out, new devices, and browser refreshes. The app may also keep a
          short-lived copy in browser storage for responsiveness; that copy is a cache, not the authoritative record.
          Clearing browser storage alone does not remove your server-backed positions.
        </p>

        <h2>5. Data security</h2>
        <p>
          We use reasonable administrative, technical, and physical safeguards such as encryption in transit and at
          rest, access controls, and routine security reviews. No method of transmission or storage is 100% secure, and
          we cannot guarantee absolute security.
        </p>

        <h2>6. Your rights and choices</h2>
        <ul>
          <li>Access and correct your data.</li>
          <li>Export your data (for example JSON/CSV/PDF where supported).</li>
          <li>Delete your account (subject to legal retention obligations).</li>
          <li>Opt out of marketing emails.</li>
          <li>EU/GDPR rights may apply depending on your location.</li>
        </ul>

        <h2>7. Cookies and tracking</h2>
        <ul>
          <li>
            <strong>Essential</strong>: authentication, security, and preferences.
          </li>
          <li>
            <strong>Analytics</strong>: usage measurement (where enabled).
          </li>
        </ul>
        <p>You can typically disable cookies in your browser settings, but some DEPTH4 features may not function.</p>

        <h2>8. Children&apos;s privacy</h2>
        <p>
          DEPTH4 is not intended for users under 18. We do not knowingly collect personal information from minors.
        </p>

        <h2>9. International users</h2>
        <p>
          DEPTH4 may be operated from multiple jurisdictions and may use service providers in different countries. You
          are responsible for compliance with local laws where you access the service.
        </p>

        <h2>10. Changes to this Privacy Policy</h2>
        <p>
          We may update this policy from time to time. We will provide notice of material changes. Continued use after
          an effective date constitutes acceptance.
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

