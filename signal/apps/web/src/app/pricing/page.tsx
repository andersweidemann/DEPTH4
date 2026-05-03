import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { TIER_OFFERS } from "@/lib/tier";
import { ProCheckoutButton } from "./ProCheckoutButton";

export default function PricingPage() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between max-w-5xl mx-auto w-full">
        <Link href="/" className="font-semibold tracking-tight text-emerald-400">
          DEPTH4
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-zinc-300 hover:text-white hover:bg-zinc-800",
            )}
          >
            Sign in
          </Link>
          <Link
            href="/signup?next=/onboarding"
            className={cn(buttonVariants({ size: "sm" }), "bg-emerald-600 text-zinc-950 hover:bg-emerald-500")}
          >
            Create account
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-12 space-y-10">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-semibold">Free vs Pro</h1>
          <p className="text-zinc-400 max-w-xl mx-auto text-sm">
            Everyone starts on <span className="text-zinc-200">Free</span>. <span className="text-emerald-400/90">Pro</span> is the paid
            plan for the full four layers and heavier alerts. Institutional is custom.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 flex flex-col text-left">
            <h2 className="text-lg font-semibold text-zinc-200">{TIER_OFFERS.free.name}</h2>
            <p className="text-3xl font-bold mt-2 text-zinc-50">{TIER_OFFERS.free.price}</p>
            <p className="text-sm text-zinc-500 mt-1">{TIER_OFFERS.free.description}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-300 flex-1">
              {TIER_OFFERS.free.features.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
                  {t}
                </li>
              ))}
            </ul>
            <Link
              href="/signup?next=/onboarding"
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "mt-6 w-full justify-center bg-zinc-800 text-zinc-200 border border-zinc-700",
              )}
            >
              Create account (Free)
            </Link>
          </div>
          <div className="rounded-2xl border-2 border-emerald-500/50 bg-zinc-900/80 p-6 flex flex-col text-left relative overflow-hidden">
            <span className="absolute top-3 right-3 text-[10px] font-bold uppercase bg-emerald-500 text-zinc-950 px-2 py-0.5 rounded">Paid</span>
            <h2 className="text-lg font-semibold text-emerald-300">{TIER_OFFERS.pro.name}</h2>
            <p className="text-3xl font-bold mt-2 text-zinc-50">{TIER_OFFERS.pro.priceLabel}</p>
            <p className="text-sm text-zinc-500 mt-1">Stripe checkout · cancel in portal</p>
            <p className="text-sm text-zinc-400 mt-2">{TIER_OFFERS.pro.description}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-200 flex-1">
              {TIER_OFFERS.pro.features.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  {t}
                </li>
              ))}
            </ul>
            <ProCheckoutButton />
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 max-w-2xl mx-auto text-center text-sm text-zinc-400">
          <h3 className="text-zinc-200 font-medium">Institutional</h3>
          <p className="mt-1">Multiple books, team seats, compliance, custom feeds. We set pricing with you.</p>
          <a
            href="mailto:hello@depth4.app"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "mt-3 inline-flex border-zinc-600 text-zinc-200",
            )}
          >
            Contact
          </a>
        </div>
        <p className="text-center text-xs text-zinc-600">Tax and final price may vary by region. Free tier and alert limits are subject to product updates.</p>
      </main>
    </div>
  );
}
