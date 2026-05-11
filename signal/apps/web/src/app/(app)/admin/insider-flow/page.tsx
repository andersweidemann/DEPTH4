"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Metric = { label: string; value: string };

function fmtPct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export default function InsiderFlowAdminPage() {
  const sb = useMemo(() => createClient(), []);
  const [ok, setOk] = useState(false);
  const [denied, setDenied] = useState(false);
  const [metrics, setMetrics] = useState<Metric[]>([]);

  useEffect(() => {
    const run = async () => {
      const { data: { user } } = await sb.auth.getUser();
      const allowed = (process.env.NEXT_PUBLIC_DEPTH4_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      const email = (user?.email ?? "").toLowerCase();
      if (!email || (allowed.length && !allowed.includes(email))) {
        setDenied(true);
        return;
      }

      // last 7d anomaly quality
      const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
      const { data: rows } = await sb
        .from("flow_anomalies")
        .select("status,confirmed_headline_at,created_at")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(5000);

      const list = (rows ?? []) as Array<{ status?: string; confirmed_headline_at?: string | null; created_at?: string }>;
      const total = list.length || 1;
      const confirmed = list.filter((r) => r.status === "CONFIRMED_MOVE").length;
      const invalidated = list.filter((r) => r.status === "INVALIDATED").length;

      const ttc: number[] = [];
      for (const r of list) {
        if (r.status !== "CONFIRMED_MOVE") continue;
        const a = Date.parse(r.created_at ?? "");
        const c = Date.parse(r.confirmed_headline_at ?? "");
        if (Number.isFinite(a) && Number.isFinite(c) && c > a) ttc.push(c - a);
      }
      const avgTtcMin = ttc.length ? Math.round(ttc.reduce((s, x) => s + x, 0) / ttc.length / 60000) : 0;

      setMetrics([
        { label: "Anomalies (7d)", value: String(list.length) },
        { label: "Confirmation rate", value: fmtPct(confirmed / total) },
        { label: "Invalidation rate", value: fmtPct(invalidated / total) },
        { label: "Avg time-to-confirm", value: ttc.length ? `${avgTtcMin} min` : "—" },
      ]);
      setOk(true);
    };
    void run();
  }, [sb]);

  if (denied) {
    return (
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-10">
        <p className="text-sm font-semibold text-zinc-100">403</p>
        <p className="mt-2 text-[12px] text-zinc-500">Admin access only.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-10">
      <p className="text-sm font-semibold text-zinc-100">Insider Flow · Admin</p>
      <p className="mt-2 text-[12px] text-zinc-500">Quality + health snapshot (client-read, 7-day window).</p>

      <div className={cn("mt-6 grid gap-3 sm:grid-cols-2", !ok && "opacity-70")}>
        {(metrics.length ? metrics : [{ label: "Loading…", value: "" }]).map((m) => (
          <div key={m.label} className="rounded-none border border-white/[0.06] bg-zinc-900/15 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{m.label}</p>
            <p className="mt-1 text-[14px] font-semibold tabular-nums text-zinc-100">{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

