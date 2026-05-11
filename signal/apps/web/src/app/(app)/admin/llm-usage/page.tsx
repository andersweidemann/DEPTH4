"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type UsageRow = {
  date: string;
  task_type: string;
  provider: string;
  model: string;
  tier: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  escalations: number;
  validation_failures: number;
  estimated_cost_usd: number;
};

type UsagePayload = {
  from: string;
  to: string;
  days: number;
  rows: UsageRow[];
  totals: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
    premium_tier_estimated_cost_usd: number;
  };
};

function useAdminGate(sb: ReturnType<typeof createClient>) {
  const [denied, setDenied] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const run = async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      const allowed = (process.env.NEXT_PUBLIC_DEPTH4_ADMIN_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const em = (user?.email ?? "").toLowerCase();
      if (!em || (allowed.length && !allowed.includes(em))) {
        setDenied(true);
        return;
      }
      setReady(true);
    };
    void run();
  }, [sb]);

  return { denied, ready };
}

function providerStyle(p: string): string {
  if (p === "nvidia") return "text-cyan-400/90";
  if (p === "kimi") return "text-violet-300/90";
  if (p === "anthropic") return "text-orange-300/90";
  return "text-[#888888]";
}

function tierStyle(t: string): string {
  if (t === "premium") return "text-[#E8473F]";
  if (t === "standard") return "text-amber-200/80";
  return "text-[#888888]";
}

export default function LlmUsageAdminPage() {
  const sb = useMemo(() => createClient(), []);
  const { denied, ready } = useAdminGate(sb);
  const [days, setDays] = useState(7);
  const [data, setData] = useState<UsagePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const run = async () => {
      setErr(null);
      const res = await fetch(`/api/admin/llm-usage?days=${days}`, { credentials: "include" });
      const j = (await res.json()) as { ok: true } & UsagePayload | { ok: false; error?: string };
      if (!res.ok || !j || typeof j !== "object" || !("ok" in j) || !j.ok) {
        setErr((j as { error?: string }).error ?? `HTTP ${res.status}`);
        setData(null);
        return;
      }
      const u = j as UsagePayload & { ok: true };
      setData({
        from: u.from,
        to: u.to,
        days: u.days,
        rows: u.rows,
        totals: u.totals,
      });
    };
    void run();
  }, [ready, days]);

  if (denied) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-[#888888]">
        <p>Unauthorized.</p>
        <Link href="/" className="mt-4 inline-block text-[#E8473F] underline">
          Home
        </Link>
      </div>
    );
  }

  if (!ready) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-[#888888]">Checking access…</div>;
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 text-[#ffffff]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">LLM usage</h1>
          <p className="mt-1 text-sm text-[#888888]">
            Aggregated from Supabase <code className="text-[#cccccc]">llm_usage_stats</code> via API.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[#888888]" htmlFor="days">
            Window
          </label>
          <select
            id="days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded border border-[#333332] bg-[#111110] px-2 py-1.5 text-sm text-[#ffffff]"
          >
            {[1, 7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} day{d > 1 ? "s" : ""}
              </option>
            ))}
          </select>
          <Link href="/admin/thesis-live" className="text-sm text-[#E8473F] underline">
            Other admin
          </Link>
        </div>
      </div>

      {err ? (
        <div className="rounded border border-[#E8473F]/40 bg-[#E8473F]/10 px-4 py-3 text-sm text-[#ffb4ae]">{err}</div>
      ) : null}

      {data?.totals ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total calls" value={String(data.totals.calls)} />
          <Stat label="Est. cost (USD)" value={data.totals.estimated_cost_usd.toFixed(4)} accent />
          <Stat label="Premium tier cost (USD)" value={data.totals.premium_tier_estimated_cost_usd.toFixed(4)} />
          <Stat
            label="Tokens in / out"
            value={`${data.totals.input_tokens.toLocaleString()} / ${data.totals.output_tokens.toLocaleString()}`}
          />
          <p className="text-xs text-[#888888] sm:col-span-2 lg:col-span-4">
            Range: {data.from} → {data.to} (UTC dates)
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded border border-[#2a2a29] bg-[#151514]">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#2a2a29] text-[#888888]">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Provider</th>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Calls</th>
              <th className="px-3 py-2 font-medium">In tok</th>
              <th className="px-3 py-2 font-medium">Out tok</th>
              <th className="px-3 py-2 font-medium">Esc</th>
              <th className="px-3 py-2 font-medium">Val fail</th>
              <th className="px-3 py-2 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).length === 0 && !err ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-[#888888]">
                  No rows yet — run LLM jobs after migration + deployment.
                </td>
              </tr>
            ) : null}
            {(data?.rows ?? []).map((r, i) => (
              <tr key={`${r.date}-${r.provider}-${r.task_type}-${r.model}-${r.tier}-${i}`} className="border-b border-[#222221]/80">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-[#cccccc]">{r.date}</td>
                <td className={cn("px-3 py-2 font-medium capitalize", providerStyle(r.provider))}>{r.provider}</td>
                <td className="max-w-[180px] truncate px-3 py-2 text-[#cccccc]" title={r.task_type}>
                  {r.task_type}
                </td>
                <td className={cn("px-3 py-2 capitalize", tierStyle(r.tier))}>{r.tier}</td>
                <td className="max-w-[140px] truncate px-3 py-2 font-mono text-xs text-[#888888]" title={r.model}>
                  {r.model}
                </td>
                <td className="px-3 py-2 tabular-nums">{r.calls}</td>
                <td className="px-3 py-2 tabular-nums text-[#aaaaaa]">{r.input_tokens.toLocaleString()}</td>
                <td className="px-3 py-2 tabular-nums text-[#aaaaaa]">{r.output_tokens.toLocaleString()}</td>
                <td className="px-3 py-2 tabular-nums">{r.escalations}</td>
                <td className="px-3 py-2 tabular-nums">{r.validation_failures}</td>
                <td className="px-3 py-2 tabular-nums text-[#e0e0e0]">{r.estimated_cost_usd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-[#666666]">Metrics only — no prompts stored.</p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded border border-[#2a2a29] bg-[#151514] px-3 py-2", accent && "border-[#E8473F]/35")}>
      <div className="text-xs text-[#888888]">{label}</div>
      <div className={cn("mt-0.5 font-mono text-lg", accent ? "text-[#E8473F]" : "text-[#ffffff]")}>{value}</div>
    </div>
  );
}
