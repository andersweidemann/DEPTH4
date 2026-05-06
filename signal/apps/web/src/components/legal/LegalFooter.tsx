"use client";

import Link from "next/link";

const SHORT_DISCLAIMER =
  "DEPTH4 is an informational platform providing macro event analysis and thesis tracking tools. We are not a broker, investment adviser, or financial planner. Content is for educational and informational purposes only and is not personalized investment advice. All investing involves risk of loss. Users are solely responsible for their own decisions.";

export function LegalFooter({ variant = "default" }: { variant?: "default" | "minimal" }) {
  return (
    <footer
      className={[
        "border-t border-white/[0.06] bg-black/20",
        variant === "minimal" ? "mt-10" : "mt-14",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-zinc-500">
          <div className="flex flex-wrap items-center gap-3">
            <Link className="hover:text-zinc-300" href="/help">
              Help
            </Link>
            <Link className="hover:text-zinc-300" href="/terms">
              Terms
            </Link>
            <Link className="hover:text-zinc-300" href="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-zinc-300" href="/risk">
              Risk disclosure
            </Link>
            <Link className="hover:text-zinc-300" href="/disclaimer">
              Disclaimer
            </Link>
          </div>
          <span className="text-zinc-600">© {new Date().getFullYear()} DEPTH4</span>
        </div>

        <p className="mt-4 max-w-4xl text-[12px] leading-relaxed text-zinc-600">{SHORT_DISCLAIMER}</p>
      </div>
    </footer>
  );
}

