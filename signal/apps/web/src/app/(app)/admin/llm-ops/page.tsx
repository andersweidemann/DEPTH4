"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Dashboard = {
  labels?: Record<string, string>;
  depth4_status?: {
    enabled: boolean;
    active_users: number;
    meets_minimum: boolean;
    min_active_users_for_depth4: number;
    background_llm_allowed: boolean;
    background_llm_blocked: boolean;
  };
  spend_summary?: {
    window_days: number;
    from: string;
    to: string;
    total_estimated_cost_usd: number;
    by_provider: Array<{
      provider: string;
      calls: number;
      estimated_cost_usd: number;
      input_tokens: number;
      output_tokens: number;
    }>;
  };
  recent_rows?: Array<{
    date: string;
    provider: string;
    task_type: string;
    tier: string;
    calls: number;
    estimated_cost_usd: number;
  }>;
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

export default function LlmOpsDashboardPage() {
  const sb = useMemo(() => createClient(), []);
  const { denied, ready } = useAdminGate(sb);
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const run = async () => {
      setErr(null);
      const res = await fetch(`/api/admin/llm-ops?days=${days}`, { credentials: "include" });
      const j = (await res.json()) as { ok: boolean; error?: string } & Dashboard;
      if (!res.ok || !j.ok) {
        setErr(j.error ?? `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(j);
    };
    void run();
  }, [ready, days]);

  const st = data?.depth4_status;
  const spend = data?.spend_summary;

  if (denied) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-[#888888]">
        Unauthorized.
        <Link href="/" className="mt-4 block text-[#E8473F] underline">
          Home
        </Link>
      </div>
    );
  }

  if (!ready) return <div className="px-4 py-10 text-[#888888]">Checking access…</div>;

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 text-[#ffffff]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">DEPTH4 ops</h1>
          <p className="mt-1 text-sm text-[#888888]">Internal — guard status + estimated LLM spend.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="d" className="text-sm text-[#888888]">
            Window
          </label>
          <select
            id="d"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded border border-[#333332] bg-[#111110] px-2 py-1.5 text-sm"
          >
            {[1, 7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d}d
              </option>
            ))}
          </select>
          <Link href="/admin/llm-usage" className="text-sm text-[#E8473F] underline">
            Raw usage rows
          </Link>
        </div>
      </div>

      {data?.labels ? (
        <ul className="mb-6 space-y-1 rounded border border-[#2a2a29] bg-[#151514] px-4 py-3 text-xs text-[#888888]">
          {Object.entries(data.labels).map(([k, v]) => (
            <li key={k}>
              <span className="text-[#666666]">{k}: </span>
              {v}
            </li>
          ))}
        </ul>
      ) : null}

      {err ? (
        <div className="mb-6 rounded border border-[#E8473F]/40 bg-[#E8473F]/10 px-4 py-3 text-sm text-[#ffb4ae]">{err}</div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="DEPTH4 enabled" value={st?.enabled === true ? "Yes" : "No"} warn={st?.enabled === false} />
        <Card
          label="Active users (24h)"
          value={st !== undefined ? String(st.active_users) : "—"}
          hint={data?.labels?.active_users}
        />
        <Card
          label="Background LLM allowed"
          value={st?.background_llm_allowed === true ? "Yes" : "No"}
          warn={st?.background_llm_blocked === true}
          hint={data?.labels?.background_llm_allowed}
        />
        <Card
          label={`Est. cost (${spend?.window_days ?? days}d)`}
          value={spend !== undefined ? `$${spend.total_estimated_cost_usd.toFixed(4)}` : "—"}
          accent
          hint={data?.labels?.estimated_cost}
        />
      </div>

      {st ? (
        <p className="mb-6 text-xs text-[#666666]">
          Min active threshold: {st.min_active_users_for_depth4} · Window UTC: {spend?.from} → {spend?.to}
        </p>
      ) : null}

      <h2 className="mb-2 text-sm font-medium text-[#cccccc]">Spend by provider</h2>
      <div className="mb-8 overflow-x-auto rounded border border-[#2a2a29] bg-[#151514]">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#2a2a29] text-[#888888]">
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Calls</th>
              <th className="px-3 py-2">In tokens</th>
              <th className="px-3 py-2">Out tokens</th>
              <th className="px-3 py-2">Est. USD</th>
            </tr>
          </thead>
          <tbody>
            {(spend?.by_provider ?? []).length === 0 && !err ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[#888888]">
                  No aggregates in range (run migration + LLM traffic).
                </td>
              </tr>
            ) : null}
            {(spend?.by_provider ?? []).map((r) => (
              <tr key={r.provider} className="border-b border-[#222221]/80">
                <td className="px-3 py-2 capitalize">{r.provider}</td>
                <td className="px-3 py-2 tabular-nums">{r.calls}</td>
                <td className="px-3 py-2 tabular-nums text-[#aaaaaa]">{r.input_tokens.toLocaleString()}</td>
                <td className="px-3 py-2 tabular-nums text-[#aaaaaa]">{r.output_tokens.toLocaleString()}</td>
                <td className="px-3 py-2 tabular-nums text-[#e0e0e0]">{r.estimated_cost_usd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-medium text-[#cccccc]">Recent expensive aggregates</h2>
      <div className="overflow-x-auto rounded border border-[#2a2a29] bg-[#151514]">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#2a2a29] text-[#888888]">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Calls</th>
              <th className="px-3 py-2">Est. USD</th>
            </tr>
          </thead>
          <tbody>
            {(data?.recent_rows ?? []).map((r, i) => (
              <tr key={`${r.date}-${r.provider}-${r.task_type}-${i}`} className="border-b border-[#222221]/80">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{r.date}</td>
                <td className="px-3 py-2 capitalize">{r.provider}</td>
                <td className="max-w-[160px] truncate px-3 py-2" title={r.task_type}>
                  {r.task_type}
                </td>
                <td className="px-3 py-2 capitalize">{r.tier}</td>
                <td className="px-3 py-2 tabular-nums">{r.calls}</td>
                <td className="px-3 py-2 tabular-nums">{r.estimated_cost_usd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  hint,
  accent,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded border border-[#2a2a29] bg-[#151514] px-3 py-2",
        accent && "border-[#E8473F]/35",
        warn && "border-amber-600/40",
      )}
      title={hint}
    >
      <div className="text-xs text-[#888888]">{label}</div>
      <div className={cn("mt-0.5 font-mono text-lg", accent ? "text-[#E8473F]" : "text-[#ffffff]")}>{value}</div>
    </div>
  );
}
