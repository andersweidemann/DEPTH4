"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MOCK_THESES, TID } from "@/lib/thesis-engine-v2/mock-data";
import { normalizeThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";

type ApiRow = {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  evidenceCount: number;
  starredUsers: number;
  inDb: boolean;
};

type ApiOk = {
  ok: true;
  rows: ApiRow[];
  totals: { evidenceRows: number; starRows: number; thesisRows: number };
};

function useAdminGate(sb: ReturnType<typeof createClient>) {
  const [denied, setDenied] = useState(false);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");

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
      setEmail(em);
      if (!em || (allowed.length && !allowed.includes(em))) {
        setDenied(true);
        return;
      }
      setReady(true);
    };
    void run();
  }, [sb]);

  return { denied, ready, email };
}

export default function ThesisLiveAdminPage() {
  const sb = useMemo(() => createClient(), []);
  const { denied, ready, email } = useAdminGate(sb);
  const [rows, setRows] = useState<(ApiRow & { inUiMock: boolean })[]>([]);
  const [totals, setTotals] = useState<{ evidenceRows: number; starRows: number; thesisRows: number } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const uiIds = useMemo(() => new Set(MOCK_THESES.map((t) => t.id)), []);
  const systemTidSet = useMemo(() => new Set<string>(Object.values(TID)), []);

  useEffect(() => {
    if (!ready) return;
    const run = async () => {
      setLoadErr(null);
      const res = await fetch("/api/admin/thesis-live-summary", { credentials: "include" });
      const j = (await res.json()) as ApiOk | { ok: false; error: string };
      if (!res.ok || !j || typeof j !== "object" || !("ok" in j) || !j.ok) {
        setLoadErr((j as { error?: string }).error ?? `HTTP ${res.status}`);
        return;
      }
      const data = j as ApiOk;
      setTotals(data.totals);
      const seen = new Set(data.rows.map((r) => r.id));
      const merged = data.rows.map((r) => ({
        ...r,
        inUiMock: uiIds.has(r.id),
      }));
      for (const id of Array.from(systemTidSet)) {
        if (seen.has(id)) continue;
        merged.push({
          id,
          title: "(missing in public.theses)",
          slug: MOCK_THESES.find((t) => t.id === id)?.slug ?? null,
          status: "—",
          evidenceCount: 0,
          starredUsers: 0,
          inDb: false,
          inUiMock: true,
        });
      }
      merged.sort((a, b) => {
        const d = b.evidenceCount - a.evidenceCount;
        if (d !== 0) return d;
        const s = b.starredUsers - a.starredUsers;
        if (s !== 0) return s;
        return a.id.localeCompare(b.id);
      });
      setRows(merged);
    };
    void run();
  }, [ready, systemTidSet, uiIds]);

  if (denied) {
    return (
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-10">
        <p className="text-sm font-semibold text-zinc-100">403</p>
        <p className="mt-2 text-[12px] text-zinc-500">Admin access only.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Thesis live · Admin</p>
          <p className="mt-2 text-[12px] text-zinc-500">
            Evidence log + stars (all users, service read). Signed in as {email || "…"}. Bell tray alerts are
            session-only — use Evidence as persisted signal volume.
          </p>
        </div>
        <Link href="/admin/insider-flow" className="text-[11px] font-medium text-zinc-500 hover:text-amber-200/90">
          Insider Flow admin →
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="border border-white/[0.06] bg-zinc-900/15 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Evidence rows</p>
          <p className="mt-1 text-lg tabular-nums text-zinc-200">{totals ? totals.evidenceRows : ready ? "0" : "—"}</p>
        </div>
        <div className="border border-white/[0.06] bg-zinc-900/15 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Star rows</p>
          <p className="mt-1 text-lg tabular-nums text-zinc-200">{totals ? totals.starRows : ready ? "0" : "—"}</p>
        </div>
        <div className="border border-white/[0.06] bg-zinc-900/15 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Theses in DB</p>
          <p className="mt-1 text-lg tabular-nums text-zinc-200">{totals ? totals.thesisRows : ready ? "0" : "—"}</p>
        </div>
      </div>

      {loadErr ? <p className="mt-4 text-[12px] text-red-300/90">{loadErr}</p> : null}

      <div className={cn("mt-6 overflow-x-auto border border-white/[0.06]", !ready && "opacity-60")}>
        <table className="w-full min-w-[800px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/[0.06] bg-zinc-900/40 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              <th className="px-3 py-2 font-semibold">Thesis</th>
              <th className="px-3 py-2 font-semibold">ID</th>
              <th className="px-3 py-2 font-semibold">DB</th>
              <th className="px-3 py-2 font-semibold">UI</th>
              <th className="px-3 py-2 font-semibold tabular-nums">Evidence</th>
              <th className="px-3 py-2 font-semibold tabular-nums">Starred users</th>
              <th className="px-3 py-2 font-semibold">Open</th>
            </tr>
          </thead>
          <tbody>
            {!ready ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-zinc-500">
                  No rows.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.04] text-zinc-300">
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-100">{normalizeThesisDisplayTitle(r.title)}</div>
                    <div className="text-[10px] text-zinc-600">{r.status}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">{r.id}</td>
                  <td className="px-3 py-2">{r.inDb ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{r.inUiMock ? "Yes" : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{r.evidenceCount}</td>
                  <td className="px-3 py-2 tabular-nums">{r.starredUsers}</td>
                  <td className="px-3 py-2">
                    {r.slug ? (
                      <Link href={`/theses/${r.slug}`} className="text-amber-200/80 hover:text-amber-100">
                        Thesis
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
        Apply migration{" "}
        <span className="font-mono text-zinc-500">20260509120000_theses_text_ids_slug_seed.sql</span> in Supabase so{" "}
        <span className="font-mono text-zinc-500">public.theses.id</span> uses the same string IDs as the UI (
        <span className="font-mono text-zinc-500">th-defense</span>, …). Then re-run the news matcher cron so evidence
        keys match.
      </p>
    </main>
  );
}
