"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function MarketingHeader() {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const isSignup = pathname === "/signup";
  const isPricing = pathname === "/pricing";

  if (isPricing) {
    return (
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-sm">
        <div className="mx-auto grid h-14 max-w-6xl grid-cols-3 items-center gap-3 px-5">
          <Link
            href="/"
            className="justify-self-start inline-flex shrink-0 items-center gap-1 text-[12px] text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Back
          </Link>
          <Link
            href="/"
            className="justify-self-center truncate text-center text-[12px] font-semibold tracking-tight text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
            DEPTH4
          </Link>
          <nav className="justify-self-end text-[12px]">
            <Link
              href="/login"
              className="px-2 py-1 text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>
    );
  }

  if (isLogin || isSignup) {
    return (
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link
              href="/"
              className="inline-flex shrink-0 items-center gap-1 text-[12px] text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden />
              Back
            </Link>
            <Link
              href="/"
              className="truncate text-[12px] font-semibold tracking-tight text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
            >
              DEPTH4
            </Link>
          </div>
          <p className="hidden flex-[2] text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:block">
            Your macro thesis engine
          </p>
          <nav className="flex min-w-0 flex-1 justify-end text-[12px]">
            {isLogin ? (
              <Link
                href="/signup"
                className="px-2 py-1 text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
              >
                Create account
              </Link>
            ) : (
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "h-8 rounded-md bg-amber-500 px-3 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]",
                )}
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-[12px] font-semibold tracking-tight text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
            DEPTH4
          </Link>
          <span className="hidden text-[11px] text-zinc-500 sm:inline">Macro intelligence engine</span>
        </div>
        <nav className="flex items-center gap-2 text-[12px]">
          <Link
            href="/pricing"
            className="px-2 py-1 text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="px-2 py-1 text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
            Sign in
          </Link>
          <Link
            href="/signup?next=/theses"
            className={cn(
              buttonVariants({ size: "sm" }),
              "inline-flex h-8 items-center justify-center rounded-md bg-amber-500 px-3 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]",
            )}
          >
            Start free
          </Link>
        </nav>
      </div>
    </header>
  );
}
