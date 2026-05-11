"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CheckoutButton({
  priceId,
  label,
  successPath = "/theses?upgraded=1",
  cancelPath = "/pricing",
}: {
  priceId: string;
  label: string;
  successPath?: string;
  cancelPath?: string;
}) {
  const r = useRouter();
  const [load, sLoad] = useState(false);
  const [err, sErr] = useState("");

  async function go() {
    if (!priceId) {
      r.push("/signup?next=" + encodeURIComponent("/pricing"));
      return;
    }
    sLoad(true);
    sErr("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId,
          successUrl: `${location.origin}${successPath.startsWith("/") ? "" : "/"}${successPath}`,
          cancelUrl: `${location.origin}${cancelPath.startsWith("/") ? "" : "/"}${cancelPath}`,
        }),
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
        {priceId ? (load ? "Redirecting…" : label) : "Create an account to subscribe"}
      </Button>
    </div>
  );
}

