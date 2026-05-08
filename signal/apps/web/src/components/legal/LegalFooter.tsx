"use client";

import Link from "next/link";
import { Depth4Wordmark } from "@/components/brand/Depth4Wordmark";

const FOOTER_DISCLAIMER = [
  "DEPTH4 is a macro analysis and information tool, not personalized investment advice.",
  "Not a broker. Not a registered investment adviser.",
].join(" ");

export function LegalFooter({ variant = "default" }: { variant?: "default" | "minimal" }) {
  return (
    <footer
      className={[
        "border-t border-white/[0.06] bg-black/20",
        variant === "minimal" ? "mt-10" : "mt-14",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="text-xs leading-relaxed text-zinc-500">
          <div className="mb-4">
            <Depth4Wordmark size="md" />
            <p className="mt-1 text-[11px] text-zinc-600">Your macro thesis engine</p>
          </div>
          <p className="text-zinc-500">{FOOTER_DISCLAIMER}</p>
          <p className="mt-2 text-zinc-600">
            See{" "}
            <Link className="font-medium text-zinc-400 hover:text-zinc-200" href="/terms">
              Terms of Use
            </Link>{" "}
            |{" "}
            <Link className="font-medium text-zinc-400 hover:text-zinc-200" href="/privacy">
              Privacy Policy
            </Link>{" "}
            |{" "}
            <Link className="font-medium text-zinc-400 hover:text-zinc-200" href="/risk-disclosure">
              Risk Disclosure
            </Link>
          </p>
          <p className="mt-4 text-zinc-700">© {new Date().getFullYear()} DEPTH4</p>
        </div>
      </div>
    </footer>
  );
}

