"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/api";
import { useDepth4AdminGate } from "@/hooks/use-depth4-privileges";
import { cn } from "@/lib/utils";
import { CATALOG_THESES, TID } from "@/lib/thesis-engine-v2/catalog-data";
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

type MutationCoveragePath = {
  id: string;
  label: string;
  effectiveLabel: string;
  actorTypes?: string[];
  notes?: string;
};

type MutationCoverage = {
  flagEnabled: boolean;
  paths: MutationCoveragePath[];
  audit24hByActor: Record<string, number>;
  audit24hTotal: number;
  auditFailures24h: null;
  auditFailureTracking: string;
  warnings: string[];
};

type AuditHealth = {
  scope: "process_lifetime";
  auditSuccessCount: number;
  auditFailureCount: number;
  auditSuccessRate: number | null;
  lastAuditFailureAt: string | null;
  limitations?: string;
};

type ApiOk = {
  ok: true;
  rows: ApiRow[];
  totals: { evidenceRows: number; starRows: number; thesisRows: number; mutationAuditRows24h?: number };
  mutationAudit24h?: Record<string, number>;
  mutationEnabled?: boolean;
  mutationCoverage?: MutationCoverage;
  mutationCounters?: { scope: "process_lifetime"; byPath: Record<string, number> };
  auditHealth?: AuditHealth;
};

function formatAuditSuccessRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 1000) / 10}%`;
}

function MutationAuditHealth({ auditHealth }: { auditHealth: AuditHealth }) {
  const hasFailures = auditHealth.auditFailureCount > 0;
  return (
    <div
      className={cn(
        "mt-4 border-t border-white/[0.06] pt-3",
        hasFailures && "rounded border border-amber-500/35 bg-amber-950/20 px-3 py-2",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Audit health</p>
      <p className="mt-1 text-[11px] text-zinc-400">
        Success: <span className="tabular-nums text-zinc-200">{auditHealth.auditSuccessCount}</span>
        {" · "}
        Failure: <span className={cn("tabular-nums", hasFailures ? "text-amber-200/90" : "text-zinc-200")}>
          {auditHealth.auditFailureCount}
        </span>
        {" · "}
        Rate: <span className="tabular-nums text-zinc-200">{formatAuditSuccessRate(auditHealth.auditSuccessRate)}</span>
      </p>
      <p className="mt-1 text-[10px] text-zinc-600">
        Scope: {auditHealth.scope.replace("_", " ")} (resets on deploy)
        {auditHealth.lastAuditFailureAt ? (
          <>
            {" "}
            · Last failure:{" "}
            <span className="font-mono text-zinc-500">{auditHealth.lastAuditFailureAt}</span>
          </>
        ) : null}
      </p>
      {hasFailures ? (
        <p className="mt-2 text-[11px] font-medium text-amber-200/90">
          Recent audit failures — inspect logs and thesis_updates RLS.
        </p>
      ) : null}
    </div>
  );
}


export default function ThesisLiveAdminPage() {
  const { denied, loading: gateLoading } = useDepth4AdminGate();
  const ready = !gateLoading && !denied;
  const [rows, setRows] = useState<(ApiRow & { inUiCatalog: boolean })[]>([]);
  const [totals, setTotals] = useState<{
    evidenceRows: number;
    starRows: number;
    thesisRows: number;
    mutationAuditRows24h?: number;
  } | null>(null);
  const [mutationAudit24h, setMutationAudit24h] = useState<Record<string, number>>({});
  const [mutationCoverage, setMutationCoverage] = useState<MutationCoverage | null>(null);
  const [auditHealth, setAuditHealth] = useState<AuditHealth | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const uiIds = useMemo(() => new Set(CATALOG_THESES.map((t) => t.id)), []);
  const systemTidSet = useMemo(() => new Set<string>(Object.values(TID)), []);

  useEffect(() => {
    if (!ready) return;
    const run = async () => {
      setLoadErr(null);
      const res = await authFetch("/api/admin/thesis-live-summary");
      const j = (await res.json()) as ApiOk | { ok: false; error: string };
      if (!res.ok || !j || typeof j !== "object" || !("ok" in j) || !j.ok) {
        setLoadErr((j as { error?: string }).error ?? `HTTP ${res.status}`);
        return;
      }
      const data = j as ApiOk;
      setTotals(data.totals);
      setMutationAudit24h(data.mutationAudit24h ?? {});
      setMutationCoverage(data.mutationCoverage ?? null);
      setAuditHealth(data.auditHealth ?? null);
      const seen = new Set(data.rows.map((r) => r.id));
      const merged = data.rows.map((r) => ({
        ...r,
        inUiCatalog: uiIds.has(r.id),
      }));
      for (const id of Array.from(systemTidSet)) {
        if (seen.has(id)) continue;
        merged.push({
          id,
          title: "(missing in public.theses)",
          slug: CATALOG_THESES.find((t) => t.id === id)?.slug ?? null,
          status: "—",
          evidenceCount: 0,
          starredUsers: 0,
          inDb: false,
          inUiCatalog: true,
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
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-10">
        <p className="text-sm font-semibold text-zinc-100">403</p>
        <p className="mt-2 text-[12px] text-zinc-500">Admin access only.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 pb-24 pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Thesis live · Admin</p>
          <p className="mt-2 text-[12px] text-zinc-500">
            Evidence log + stars (all users, service read). Bell tray alerts are session-only — use Evidence as
            persisted signal volume.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] font-medium text-zinc-500">
          <Link href="/admin/insider-flow" className="hover:text-amber-200/90">
            Insider Flow →
          </Link>
          <Link href="/admin/depth4-roles" className="hover:text-[#E8473F]">
            DEPTH4 roles →
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="border border-white/[0.06] bg-zinc-900/15 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Mutation audit (24h)</p>
          <p className="mt-1 text-lg tabular-nums text-zinc-200">
            {totals?.mutationAuditRows24h != null ? totals.mutationAuditRows24h : ready ? "0" : "—"}
          </p>
          {Object.keys(mutationAudit24h).length ? (
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
              {Object.entries(mutationAudit24h)
                .map(([k, n]) => `${k}: ${n}`)
                .join(" · ")}
            </p>
          ) : null}
        </div>
      </div>

      {loadErr ? <p className="mt-4 text-[12px] text-red-300/90">{loadErr}</p> : null}

      {mutationCoverage ? (
        <section className="mt-6 rounded-lg border border-white/[0.06] bg-zinc-900/20 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Mutation coverage</p>
            <p className="text-[10px] text-zinc-600">
              USE_THESIS_MUTATION:{" "}
              <span className={mutationCoverage.flagEnabled ? "text-emerald-400/90" : "text-amber-300/90"}>
                {mutationCoverage.flagEnabled ? "on" : "off"}
              </span>
            </p>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">{mutationCoverage.auditFailureTracking}</p>
          {mutationCoverage.warnings.length ? (
            <ul className="mt-2 space-y-1">
              {mutationCoverage.warnings.map((w) => (
                <li key={w} className="text-[11px] text-amber-200/85">
                  {w}
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-3 space-y-1.5">
            {mutationCoverage.paths.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                <span className="font-medium text-zinc-300">{p.label}</span>
                <span className="text-zinc-600">— {p.effectiveLabel}</span>
                {p.actorTypes?.length ? (
                  <span className="font-mono text-[10px] text-zinc-600">({p.actorTypes.join(", ")})</span>
                ) : null}
              </li>
            ))}
          </ul>

          {auditHealth ? (
            <MutationAuditHealth auditHealth={auditHealth} />
          ) : null}
        </section>
      ) : null}

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
                  <td className="px-3 py-2">{r.inUiCatalog ? "Yes" : "—"}</td>
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
    </div>
  );
}
