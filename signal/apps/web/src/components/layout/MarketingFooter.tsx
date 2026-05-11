import Link from "next/link";
import { Depth4Wordmark } from "@/components/brand/Depth4Wordmark";

const DISCLAIMER =
  "DEPTH4 is a macro analysis and information tool, not personalized investment advice. Not a broker. Not a registered investment adviser.";

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-transparent py-6">
      <div className="mx-auto max-w-6xl px-5 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Depth4Wordmark href="/" size="sm" align="center" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Your macro thesis engine</span>
          </div>

          <p className="max-w-xl text-[11px] text-zinc-500">{DISCLAIMER}</p>

          <p className="text-[11px] text-zinc-500">
            <Link href="/terms" className="text-zinc-400 hover:text-zinc-200">
              Terms of Use
            </Link>
            {" | "}
            <Link href="/privacy" className="text-zinc-400 hover:text-zinc-200">
              Privacy Policy
            </Link>
            {" | "}
            <Link href="/risk-disclosure" className="text-zinc-400 hover:text-zinc-200">
              Risk Disclosure
            </Link>
          </p>

          <p className="text-[11px] text-zinc-600">© {new Date().getFullYear()} DEPTH4</p>
        </div>
      </div>
    </footer>
  );
}
