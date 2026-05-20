"use client";

import { useState } from "react";
import { authFetch } from "@/lib/api";
import { useSubscription } from "@/lib/billing/useSubscription";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Override detected tier (e.g. from server props). */
  tier?: "free" | "pro";
  compact?: boolean;
};

export function UpgradeButton({ className, tier: tierProp, compact }: Props) {
  const { tier: detectedTier, isPro, loading: authLoading } = useSubscription();
  const tier = tierProp ?? detectedTier;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function handleUpgrade() {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          successUrl: `${origin}/theses?checkout=success`,
          cancelUrl: `${origin}/theses?checkout=canceled`,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "Checkout unavailable. Try again or contact support.");
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handleManage() {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error === "no_customer" ? "No billing account yet — upgrade first." : "Portal unavailable.");
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  const showPro = tier === "pro" || isPro;

  return (
    <div className={cn("inline-flex flex-col items-end gap-1", className)}>
      {error ? <p className="max-w-[220px] text-right text-[10px] text-red-400/90">{error}</p> : null}
      <button
        type="button"
        onClick={() => void (showPro ? handleManage() : handleUpgrade())}
        disabled={loading || authLoading}
        className={cn(
          "rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8473F]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e] disabled:opacity-50",
          showPro
            ? "border-white/[0.12] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
            : "border-[#E8473F]/40 bg-[#E8473F]/10 text-[#E8473F] hover:bg-[#E8473F]/20",
          compact && "px-2 py-1 text-[10px]",
        )}
      >
        {loading
          ? "Loading…"
          : showPro
            ? compact
              ? "Manage"
              : "Manage subscription"
            : compact
              ? "Upgrade"
              : "Upgrade to Pro — $20/mo"}
      </button>
    </div>
  );
}
