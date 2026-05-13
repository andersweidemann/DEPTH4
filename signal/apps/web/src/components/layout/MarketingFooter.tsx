"use client";

import Link from "next/link";

const DISCLAIMER =
  "DEPTH4 is a macro analysis and information tool, not personalized investment advice. Not a broker. Not a registered investment adviser.";

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 40"
      className={className}
      aria-hidden
    >
      <rect x="0" y="4" width="18" height="3" fill="#E8473F" opacity="0.45" />
      <rect x="3" y="12" width="22" height="3" fill="#E8473F" opacity="0.62" />
      <rect x="6" y="20" width="26" height="3" fill="#E8473F" opacity="0.8" />
      <rect x="9" y="28" width="30" height="4" fill="#E8473F" opacity="1" />
    </svg>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-transparent py-6">
      <div className="mx-auto max-w-6xl px-5 text-center">
        <div className="flex items-center justify-center gap-2">
          <Link href="/" className="inline-flex shrink-0 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8473F]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111110] rounded-sm" aria-label="DEPTH4 home">
            <LogoIcon className="h-4 w-auto" />
          </Link>
          <span className="text-[12px] font-semibold text-zinc-100">DEPTH4</span>
          <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">YOUR MACRO THESIS ENGINE</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span>Data: Reuters, Bloomberg</span>
          <span className="text-zinc-700">·</span>
          <span>Not a broker</span>
          <span className="text-zinc-700">·</span>
          <span>Not investment advice</span>
        </div>

        <p className="mx-auto mt-4 max-w-lg text-[11px] text-zinc-500">{DISCLAIMER}</p>

        <p className="mt-2 text-[11px] text-zinc-500">
          <Link href="/terms" className="text-zinc-400 transition-colors duration-200 hover:text-zinc-200">
            Terms
          </Link>
          <span className="mx-1 text-zinc-700">·</span>
          <Link href="/privacy" className="text-zinc-400 transition-colors duration-200 hover:text-zinc-200">
            Privacy
          </Link>
          <span className="mx-1 text-zinc-700">·</span>
          <Link href="/risk-disclosure" className="text-zinc-400 transition-colors duration-200 hover:text-zinc-200">
            Risk Disclosure
          </Link>
        </p>

        <p className="mt-2 text-[11px] text-zinc-600">© 2026 DEPTH4</p>
      </div>
    </footer>
  );
}
