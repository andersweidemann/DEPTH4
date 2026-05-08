"use client";

import { useEffect, useMemo, useRef } from "react";
import { Radar, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useV2Plan } from "@/lib/thesis-engine-v2/use-plan";
import { useThesisLiveOptional } from "@/lib/thesis-engine-v2/thesis-live-context";
import { createClient } from "@/lib/supabase/client";

function planGte(a: string, b: string) {
  const order = ["free", "analyst", "pro", "creator"];
  return order.indexOf(a) >= order.indexOf(b);
}

export function InsiderFlowRadarButton({ onClick, state }: { onClick: () => void; state: "none" | "bull" | "bear" }) {
  const tone =
    state === "bull" ? "text-teal-200 hover:text-teal-100" : state === "bear" ? "text-amber-200 hover:text-amber-100" : "text-zinc-500 hover:text-zinc-300";
  return (
    <button
      type="button"
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-md ring-1 ring-white/[0.08] hover:bg-zinc-900/50",
        tone,
      )}
      aria-label="Insider Flow Detector"
      title="Insider Flow Detector"
      onClick={onClick}
    >
      <Radar className="h-4 w-4" />
    </button>
  );
}

export function InsiderFlowPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { plan } = useV2Plan();
  const live = useThesisLiveOptional();
  const sb = useMemo(() => createClient(), []);

  const anomalies = useMemo(() => live?.insiderFlowAnomalies ?? [], [live?.insiderFlowAnomalies]);
  const latest = anomalies[0] ?? null;
  const invalidationCopy = (reason?: string) => {
    if (!reason) return "Invalidated.";
    if (reason.startsWith("contradicting_headline")) return "Invalidated by contradicting headline.";
    if (reason.startsWith("price_reversal")) return "Invalidated by price reversal.";
    return "Invalidated.";
  };

  const canSeeLog = planGte(plan, "analyst");
  const canRealtime = planGte(plan, "pro");
  const fmtDelta = (ms: number) => {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h}h ${rem}m`;
  };
  const confidence = (z: number, volMult: number) => {
    const zN = Math.min(3, Math.max(0, Math.abs(z)));
    const vN = Math.min(6, Math.max(0, volMult));
    return Math.round((zN / 3) * 55 + (vN / 6) * 45);
  };

  const visible = useMemo(() => {
    if (!latest) return { hasRecent: false, recentCount: 0 };
    const cutoff = Date.now() - 24 * 60 * 60_000;
    const recent = anomalies.filter((a) => a.createdAt >= cutoff);
    return { hasRecent: recent.length > 0, recentCount: recent.length };
  }, [anomalies, latest]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  if (!open) return null;

  async function enablePush() {
    const { data: { session } } = await sb.auth.getSession();
    const tok = session?.access_token;
    if (!tok) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (typeof Notification === "undefined") return;

    const perm = await Notification.requestPermission();
    if (perm !== "granted") return;

    // Ensure SW is ready (next-pwa registers /sw.js automatically).
    const reg = await navigator.serviceWorker.ready;
    const vapid = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
    if (!vapid) return;

    const toUint8 = (base64String: string) => {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
      return outputArray;
    };

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toUint8(vapid),
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify(sub),
    });
  }

  return (
    <div className="fixed inset-0 z-[140] flex justify-end" role="dialog" aria-modal="true" aria-label="Insider Flow Detector">
      <button
        type="button"
        className="absolute inset-0 bg-black/[0.35]"
        aria-label="Close"
        onClick={onClose}
      />
      <aside
        ref={rootRef}
        className="relative z-[1] flex h-dvh w-full max-w-[28rem] flex-col bg-[#131316] ring-1 ring-white/[0.08]"
      >
        <div className="flex items-center justify-between gap-3 bg-[#151518] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-zinc-100">Insider Flow Detector</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">Unusual pre-headline flow tied to your theses.</p>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-200"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="h-px w-full bg-white/[0.06]" aria-hidden />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!visible.hasRecent ? (
            <div className="text-[12px] text-zinc-500">
              <p className="text-zinc-300">No flow anomalies yet.</p>
              <p className="mt-1">Add Insider Flow setup on a thesis to start monitoring.</p>
              <p className="mt-3 text-[11px] text-zinc-600">
                Tip: star a thesis if you want bell alerts when a leak changes scenario probabilities.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-none border border-white/[0.06] bg-zinc-900/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Latest</p>
                {latest ? (
                  <>
                    <p className="mt-2 text-[12px] font-semibold text-zinc-100">{latest.thesisTitle}</p>
                    <p className="mt-1 text-[11px] text-zinc-300">
                      {latest.patternType === "BULL_LEAK" ? "Bull-leak anomaly" : "Bear-leak anomaly"} ·{" "}
                      {latest.status === "UNCONFIRMED_LEAK" ? "Unconfirmed leak" : latest.status === "CONFIRMED_MOVE" ? "Confirmed move" : "Invalidated"}
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                      {latest.status === "INVALIDATED" ? invalidationCopy(latest.statusReason) : latest.notes}
                    </p>
                    <div className="mt-3 grid gap-2">
                      {latest.instrumentsMoved.slice(0, 5).map((x) => {
                        const c = confidence(x.z_score, x.volume_multiple);
                        return (
                          <div key={x.symbol} className="grid gap-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-mono text-zinc-300">{x.symbol}</span>
                              <span className="tabular-nums text-zinc-400">
                                {(x.return_15m * 100).toFixed(2)}% · {x.volume_multiple.toFixed(1)}x · z {x.z_score.toFixed(2)}
                              </span>
                            </div>
                            <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800/80">
                              <div
                                className={cn("h-full rounded-full", c >= 80 ? "bg-emerald-500/80" : c >= 55 ? "bg-amber-500/80" : "bg-rose-500/70")}
                                style={{ width: `${c}%` }}
                                aria-hidden
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Link
                        href={`/theses/${encodeURIComponent(latest.thesisId)}`}
                        className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-200"
                      >
                        View thesis →
                      </Link>
                      {canRealtime ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Realtime (Pro)</span>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>

              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Event log</p>
                {!canSeeLog ? (
                  <div className="mt-2 rounded-none border border-white/[0.06] bg-zinc-900/20 p-3 text-[12px] text-zinc-500">
                    <p className="text-zinc-300">Free tier: indicator only (last 24h).</p>
                    <p className="mt-1">Upgrade to Analyst to see the full 7-day log and pattern details.</p>
                    <Link href="/pricing?source=insider-flow&recommended=analyst" className="mt-3 inline-block text-[11px] font-semibold text-amber-200/90 hover:text-amber-100">
                      View plans →
                    </Link>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {anomalies.slice(0, 30).map((a) => (
                      <div key={a.id} className="rounded-none border border-white/[0.06] bg-zinc-900/15 px-3 py-2">
                        <p className="text-[11px] font-semibold text-zinc-200">{a.thesisTitle}</p>
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          {a.patternType === "BULL_LEAK" ? "Bull leak" : "Bear leak"} ·{" "}
                          {a.status === "UNCONFIRMED_LEAK" ? "Unconfirmed" : a.status === "CONFIRMED_MOVE" ? "Confirmed" : "Invalidated"}
                        </p>
                        {a.status === "CONFIRMED_MOVE" && a.confirmedHeadlineAt ? (
                          <p className="mt-0.5 text-[11px] text-emerald-300/90">
                            ✅ Confirmed {fmtDelta(a.confirmedHeadlineAt - a.createdAt)} later
                          </p>
                        ) : null}
                        {a.status === "INVALIDATED" ? (
                          <p className="mt-0.5 text-[11px] text-zinc-500">{invalidationCopy(a.statusReason)}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-white/[0.06] px-4 py-3 text-[11px] text-zinc-600">
          {canSeeLog ? "Analyst: 7-day log enabled." : "Free: 24h indicator only."}{" "}
          {canRealtime ? "Pro: realtime alerts enabled." : null}
          {plan === "pro" ? (
            <button
              type="button"
              className="ml-2 text-[11px] font-semibold text-amber-200/90 hover:text-amber-100"
              onClick={() => void enablePush()}
            >
              Enable push →
            </button>
          ) : (
            <Link
              href="/pricing?source=push-notifications&recommended=pro"
              className="ml-2 text-[11px] font-semibold text-amber-200/90 hover:text-amber-100"
            >
              Push alerts (Pro) →
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}

