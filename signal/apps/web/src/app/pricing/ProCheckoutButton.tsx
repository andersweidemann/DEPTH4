"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const proPrice = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || "";

export function ProCheckoutButton() {
  const r = useRouter();
  const [load, sLoad] = useState(false);
  const [err, sErr] = useState("");

  async function go() {
    if (!proPrice) {
      r.push("/signup?next=" + encodeURIComponent("/pricing"));
      return;
    }
    sLoad(true);
    sErr("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: proPrice, successUrl: `${location.origin}/dashboard?upgraded=1` }),
      });
      const j = (await res.json()) as { url?: string; error?: string };
      if (j.url) location.href = j.url;
      else sErr(j.error || "Checkout unavailable. Create an account first, then try again from the app.");
    } catch {
      sErr("Network error");
    } finally {
      sLoad(false);
    }
  }

  return (
    <div className="mt-6">
      {err && <p className="text-xs text-rose-400 mb-2">{err}</p>}
      <Button
        className="w-full bg-emerald-600 hover:bg-emerald-500"
        type="button"
        disabled={load}
        onClick={() => void go()}
      >
        {proPrice ? (load ? "Redirecting…" : "Go to Pro checkout") : "Create a Free account, then add Pro"}
      </Button>
    </div>
  );
}
