"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const BG = "#111110";
const ACCENT = "#E8473F";
const MUTED = "#888888";
const FG = "#ffffff";

type StageRollup = {
  reached: boolean;
  ok: boolean;
  lastAt: string | null;
  status: string | null;
  reason_code: string | null;
  detail: string | null;
};

type AuditItem = {
  cluster_id: string;
  cluster_status: string;
  title_hint: string | null;
  signal_score: number | null;
  member_count: number;
  halt: { haltedAt: string; why: string | null };
  ids: {
    news_item_id: string | null;
    cluster_id: string;
    thesis_candidate_id: string | null;
    thesis_id: string | null;
  };
  computed: { map_listable: boolean | null };
  stages: Record<string, StageRollup>;
  trace_tail: unknown[];
};

type ApiOk = {
  ok: true;
  items: AuditItem[];
  counters: Record<string, number>;
  bottlenecks: Array<{ severity: string; message: string }>;
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

function StageChip({ label, s }: { label: string; s: StageRollup }) {
  const tone = !s.reached ? "border-white/[0.06] text-[#888888]" : s.ok ? "border-emerald-500/35 text-emerald-200/90" : "border-white/[0.08] text-amber-200/85";
  return (
    <div className={cn("rounded border px-2 py-1 text-[10px]", tone)} title={s.detail ?? s.reason_code ?? ""}>
      <span className="font-semibold uppercase tracking-[0.08em]">{label}</span>
      <span className="ml-1 opacity-80">{s.reached ? (s.ok ? "ok" : s.status ?? "—") : "—"}</span>
    </div>
  );
}

export default function ThesisPipelineAuditAdminPage() {
  const sb = useMemo(() => createClient(), []);
  const { denied, ready, email } = useAdminGate(sb);
  const [data, setData] = useState<ApiOk | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const run = async () => {
      setLoadErr(null);
      const res = await authFetch("/api/admin/thesis-pipeline-audit");
      const j = (await res.json()) as ApiOk | { ok: false; error: string };
      if (!res.ok || !j || typeof j !== "object" || !("ok" in j) || !j.ok) {
        setLoadErr((j as { error?: string }).error ?? `HTTP ${res.status}`);
        return;
      }
      setData(j as ApiOk);
    };
    void run();
  }, [ready]);

  if (denied) {
    return (
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-10" style={{ backgroundColor: BG }}>
        <p className="text-sm font-semibold" style={{ color: FG }}>
          403
        </p>
        <p className="mt-2 text-[12px]" style={{ color: MUTED }}>
          Admin access only.
        </p>
      </div>
    );
  }

  const c = data?.counters;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-10" style={{ backgroundColor: BG, minHeight: "100vh" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: FG }}>
            Thesis pipeline audit
          </p>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed" style={{ color: MUTED }}>
            Latest 20 discovery clusters: ingest → cluster → promote → macro reasoning → candidate → validation → thesis
            row → `/theses` map eligibility. Signed in as {email || "…"}.
          </p>
        </div>
        <Link href="/admin/thesis-live" className="text-[11px] font-medium hover:underline" style={{ color: ACCENT }}>
          Thesis live admin →
        </Link>
      </div>

      {c ? (
        <div className="mt-6 grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {(
            [
              ["ingested", c.ingested],
              ["clustered", c.clustered],
              ["promoted", c.discovery_promoted],
              ["reasoned✓", c.reasoned_ok],
              ["reasoned✗", c.reasoned_failed],
              ["candidate", c.candidate_created],
              ["validated", c.validated],
              ["rejected", c.rejected],
              ["thesis", c.thesis_promoted],
              ["surfaced", c.surfaced],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="border border-white/[0.06] bg-zinc-900/20 px-2 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: MUTED }}>
                {k}
              </p>
              <p className="mt-1 text-base tabular-nums" style={{ color: FG }}>
                {v}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {data?.bottlenecks?.length ? (
        <div className="mt-4 space-y-2">
          {data.bottlenecks.map((b, i) => (
            <div
              key={i}
              className="border px-3 py-2 text-[12px]"
              style={{
                borderColor: b.severity === "warn" ? `${ACCENT}55` : "rgba(255,255,255,0.08)",
                color: b.severity === "warn" ? "#fecaca" : MUTED,
              }}
            >
              {b.message}
            </div>
          ))}
        </div>
      ) : null}

      {loadErr ? (
        <p className="mt-4 text-[12px]" style={{ color: "#fca5a5" }}>
          {loadErr}
        </p>
      ) : null}

      <div className={cn("mt-6 space-y-4", !ready && "opacity-60")}>
        {(data?.items ?? []).map((it) => (
          <div key={it.cluster_id} className="border border-white/[0.06] bg-zinc-900/15 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-mono" style={{ color: MUTED }}>
                  {it.cluster_id}
                </p>
                <p className="mt-1 text-[13px] font-medium" style={{ color: FG }}>
                  {it.title_hint ?? "(no title_hint)"}
                </p>
                <p className="mt-1 text-[11px]" style={{ color: MUTED }}>
                  status {it.cluster_status} · score {it.signal_score ?? "—"} · members {it.member_count} · map_listable{" "}
                  {it.computed.map_listable == null ? "—" : it.computed.map_listable ? "yes" : "no"}
                </p>
              </div>
              <div className="text-right text-[10px]" style={{ color: MUTED }}>
                <div>news {it.ids.news_item_id ?? "—"}</div>
                <div>candidate {it.ids.thesis_candidate_id ?? "—"}</div>
                <div>thesis {it.ids.thesis_id ?? "—"}</div>
              </div>
            </div>

            {it.halt.haltedAt !== "none" ? (
              <p className="mt-2 text-[11px]" style={{ color: ACCENT }}>
                Halted at <span className="font-semibold">{it.halt.haltedAt}</span>
                {it.halt.why ? ` — ${it.halt.why}` : ""}
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-emerald-200/80">Pipeline trace complete through last recorded stage.</p>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              <StageChip label="ingest" s={it.stages.ingested} />
              <StageChip label="cluster" s={it.stages.clustered} />
              <StageChip label="promote" s={it.stages.discovery_promoted} />
              <StageChip label="reason" s={it.stages.reasoned} />
              <StageChip label="cand" s={it.stages.candidate_created} />
              <StageChip label="valid" s={it.stages.validation} />
              <StageChip label="thesis" s={it.stages.thesis_promoted} />
              <StageChip label="surface" s={it.stages.surfaced_ui} />
            </div>

            {it.trace_tail.length ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px]" style={{ color: MUTED }}>
                  Raw trace tail ({it.trace_tail.length})
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded border border-white/[0.06] bg-black/40 p-2 text-[10px] text-zinc-300">
                  {JSON.stringify(it.trace_tail, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
