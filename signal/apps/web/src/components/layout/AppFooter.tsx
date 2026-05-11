import Link from "next/link";

const DISCLAIMER =
  "DEPTH4 is a macro analysis and information tool, not personalized investment advice. Not a broker. Not a registered investment adviser.";

export function AppFooter() {
  return (
    <div className="border-t border-white/[0.06] py-6">
      <div className="mx-auto max-w-6xl px-5 text-center">
        <p className="text-[11px] text-zinc-500">{DISCLAIMER}</p>
        <p className="mt-2 text-[11px] text-zinc-500">
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
        <p className="mt-2 text-[11px] text-zinc-600">© {new Date().getFullYear()} DEPTH4</p>
      </div>
    </div>
  );
}
