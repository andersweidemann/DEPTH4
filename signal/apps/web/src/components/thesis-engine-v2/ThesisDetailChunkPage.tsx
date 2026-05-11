"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ChatMessage,
  ChatResponse,
  EvidenceItem,
  LinkedPosition,
  Thesis,
  ThesisAssessment,
} from "@/types/thesis";

export function ThesisDetailChunkPage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : params.slug?.[0] ?? "";

  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [assessment, setAssessment] = useState<ThesisAssessment | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [positions, setPositions] = useState<LinkedPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const refetchPositions = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/theses/${slug}/positions`);
      if (!res.ok) {
        setPositions(null);
        return;
      }
      const p = (await res.json()) as LinkedPosition | null;
      setPositions(p);
    } catch {
      setPositions(null);
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/theses/${slug}`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("Failed to load thesis")),
      ),
      fetch(`/api/theses/${slug}/assessment`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/theses/${slug}/evidence`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetch(`/api/theses/${slug}/positions`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([t, a, e, p]) => {
        setThesis(t as Thesis);
        setAssessment(a as ThesisAssessment | null);
        setEvidence(Array.isArray(e) ? (e as EvidenceItem[]) : []);
        setPositions(p as LinkedPosition | null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load thesis");
        setLoading(false);
      });
  }, [slug]);

  const handleSend = async (text: string) => {
    if (!text.trim() || chatLoading || !slug) return;
    const msg = text.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: msg }]);
    setChatLoading(true);

    try {
      const res = await fetch(`/api/theses/${slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok) throw new Error("Chat failed");
      const data: ChatResponse = await res.json();
      setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I could not process that request. Please try again.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto h-4 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="mx-auto mt-2 h-3 w-48 animate-pulse rounded bg-zinc-800" />
      </div>
    );
  }

  if (error || !thesis) {
    return (
      <div className="py-20 text-center">
        <p className="text-[14px] text-red-400">
          Failed to load thesis.{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-amber-400 hover:text-amber-300"
          >
            Retry
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <Link
        href="/theses"
        className="inline-flex items-center gap-1 text-[12px] text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="h-3 w-3" /> All theses
      </Link>

      {/* PART A */}
      <div className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{thesis.title}</p>
            <h1 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-zinc-50">{thesis.statement}</h1>
          </div>
          {thesis.isEntryValid && (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-emerald-400">Entry valid</span>
            </div>
          )}
        </div>

        <p className="mt-3 max-w-xl text-[14px] font-medium text-zinc-300">{thesis.summary}</p>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-zinc-400">{thesis.description}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium text-zinc-300">{thesis.asset}</span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase",
              thesis.direction === "short"
                ? "border-red-500/30 text-red-400"
                : "border-emerald-500/30 text-emerald-400",
            )}
          >
            {thesis.direction}
          </span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase",
              thesis.status === "Ready"
                ? "border-amber-500/30 text-amber-400"
                : "border-zinc-600/30 text-zinc-400",
            )}
          >
            {thesis.status.toLowerCase()}
          </span>
          {thesis.tradeable && (
            <span className="rounded-full border border-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-400">
              tradeable
            </span>
          )}
        </div>
      </div>

      {/* PART B */}
      <div className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-white/[0.08] bg-zinc-900/30 p-4 sm:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Thesis conviction</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-amber-400">{thesis.conviction}%</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${thesis.conviction}%` }} />
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
            Thesis conviction is DEPTH4&apos;s estimate that this idea is broadly right over this horizon. It equals
            Clean win + Messy win. The paths below show how that payoff is most likely to arrive.
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-400/80">{thesis.convictionRationale}</p>
        </div>

        <div className="sm:border-l sm:border-white/[0.06] sm:pl-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Mispricing score</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-50">
                {thesis.mispricingScore}
                <span className="text-lg font-normal text-zinc-500">/100</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Horizon</p>
              <p className="mt-1 text-[13px] text-zinc-300">{thesis.horizon}</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Advisory</p>
            <p className="mt-1 text-[13px] text-amber-400">{thesis.advisory}</p>
          </div>

          <div className="mt-3">
            <p className="text-[11px] leading-relaxed text-red-400/80">
              <span className="text-zinc-500">Invalidation ·</span> {thesis.invalidation}
            </p>
          </div>
        </div>
      </div>

      {/* PART C */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Resolution paths</p>
            <p className="text-[10px] text-zinc-600">How this can play out</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-white/[0.08] px-3 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
          >
            How to read these
          </button>
        </div>

        <p className="mb-4 max-w-2xl text-[11px] leading-relaxed text-zinc-500">
          These percentages show how this thesis is most likely to resolve: Clean win pays roughly as planned; Messy
          win is directionally right but slower or choppier; Thesis broken means the thesis is invalidated.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(
            [
              { key: "cleanWin", label: "Clean win", color: "amber" },
              { key: "messyWin", label: "Messy win", color: "amber" },
              { key: "thesisBroken", label: "Thesis broken", color: "red" },
            ] as const
          ).map(({ key, label, color }) => {
            const path = thesis.resolutionPaths[key as keyof typeof thesis.resolutionPaths];
            const pct = path.probability;
            const barColor = color === "red" ? "bg-red-500" : "bg-amber-500";
            const textColor = color === "red" ? "text-red-400" : "text-amber-400";
            return (
              <div key={key} className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-zinc-200">{label}</span>
                  <span className="text-[10px] text-zinc-500">·</span>
                  <span className={cn("text-lg font-semibold", textColor)}>{pct}%</span>
                  <div className="ml-auto h-1 w-16 overflow-hidden rounded-full bg-zinc-800">
                    <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">What happens</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{path.whatHappens}</p>
                </div>
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">What it means for the trade</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{path.tradeImpact}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PART D */}
      <div className="mt-8 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5">
        <p className="text-[13px] font-semibold text-zinc-200">Mispricing analysis</p>

        <div className="mt-3">
          <p className="text-[12px] text-zinc-400">
            Mispricing score: <span className="font-medium text-zinc-100">{thesis.mispricingScore}/100</span>
          </p>
          <p className="mt-1 max-w-lg text-[11px] text-zinc-500">
            How attractive is this setup right now — timing, what is still unpriced, and how clear the trigger and
            plan are. Hero conviction is a separate dial (probability the idea is broadly right).
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Paths-implied edge (Clean + Messy)</p>
            <p className="mt-1 text-xl font-semibold text-amber-400">{thesis.conviction}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Score components (sum = headline)</p>
            <div className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-zinc-400">Structural setup (book scores)</span>
                <span className="font-medium text-zinc-200">
                  {thesis.mispricingComponents.structuralSetup >= 0 ? "+" : ""}
                  {thesis.mispricingComponents.structuralSetup}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Resolution path shape</span>
                <span className="font-medium text-zinc-200">
                  {thesis.mispricingComponents.resolutionPathShape >= 0 ? "+" : ""}
                  {thesis.mispricingComponents.resolutionPathShape}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Conviction alignment vs book</span>
                <span className="font-medium text-zinc-200">
                  {thesis.mispricingComponents.convictionAlignment >= 0 ? "+" : ""}
                  {thesis.mispricingComponents.convictionAlignment}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Live evidence freshness</span>
                <span className="font-medium text-zinc-200">
                  {thesis.mispricingComponents.evidenceFreshness >= 0 ? "+" : ""}
                  {thesis.mispricingComponents.evidenceFreshness}
                </span>
              </div>
              <div className="mt-1 flex justify-between border-t border-white/[0.06] pt-1">
                <span className="text-zinc-400">Conviction vs setup (informational)</span>
                <span
                  className={cn(
                    "font-medium",
                    thesis.mispricingComponents.convictionVsSetup < 0 ? "text-red-400" : "text-zinc-200",
                  )}
                >
                  {thesis.mispricingComponents.convictionVsSetup >= 0 ? "+" : ""}
                  {thesis.mispricingComponents.convictionVsSetup} pts
                </span>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-zinc-600">
              <span className="text-zinc-500">Why ·</span> Mispricing scores the{" "}
              <span className="font-medium text-zinc-400">trade</span> (timing, what is still unpriced, trigger and
              plan clarity). Thesis conviction scores whether the <span className="font-medium text-zinc-400">idea</span>{" "}
              is broadly right. They can diverge: high conviction with only moderate mispricing often means the story is
              right but part of the move is priced, the path is messy, or execution is noisy.
            </p>
          </div>
        </div>
      </div>

      {/* PART E */}
      <div className="mt-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Four-level cascade</p>
        <p className="mt-1 text-[11px] text-zinc-600">
          How DEPTH4 stacks the story from today&apos;s facts to the year&apos;s tape — so you see the edge and when to
          act.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              { key: "l1", accent: true },
              { key: "l2", accent: false },
              { key: "l3", accent: false },
              { key: "l4", accent: false },
            ] as const
          ).map(({ key, accent }) => {
            const level = thesis.fourLevelCascade[key as keyof typeof thesis.fourLevelCascade];
            return (
              <div
                key={key}
                className={cn(
                  "rounded-lg p-4",
                  accent ? "border border-amber-500/20 bg-zinc-900/30" : "border border-white/[0.06] bg-zinc-900/30",
                )}
              >
                <p
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-[0.14em]",
                    accent ? "text-amber-400" : "text-zinc-400",
                  )}
                >
                  {level.timeframe}
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">{level.label}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{level.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* PART F */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-md bg-white/[0.04] px-3 py-1.5 text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Thesis conviction crossed threshold.
        </button>
        <div className="flex items-center gap-2">
          <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Alerts · Major changes</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/book"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 text-[12px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            Open position
          </Link>
          <Link href="/risk-disclosure" className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-400">
            Risk
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400/80">Why now</p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">{thesis.whyNow}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400/80">
            What the market hasn&apos;t priced in yet
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">{thesis.whatMarketHasntPriced}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400/80">Trigger</p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">{thesis.trigger}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400/80">Trade</p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">{thesis.trade}</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400/80">Time stop</p>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-zinc-300">{thesis.timeStop}</p>
      </div>

      <Link href="/help" className="mt-4 inline-flex items-center gap-1 text-[11px] text-amber-400 transition-colors hover:text-amber-300">
        How to read a thesis →
      </Link>

      {/* PART G */}
      <div className="mt-10 rounded-lg border border-white/[0.08] bg-zinc-900/30 p-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Ask about this thesis</p>
          <span className="text-[10px] text-zinc-600">Informational only</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          This assistant provides general thesis analysis for informational purposes only. It does not provide
          personalized investment advice.
        </p>
        <p className="text-[11px] text-zinc-500">
          All trading decisions and risk management are your sole responsibility.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            "What does the thesis suggest?",
            "Entry conditions?",
            "Risk management considerations?",
            "What changed recently?",
            "Explain the thesis simply",
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleSend(prompt)}
              className="rounded-md border border-white/[0.08] px-3 py-1.5 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-zinc-100"
            >
              {prompt}
            </button>
          ))}
        </div>

        {chatMessages.length > 0 && (
          <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
            {chatMessages.map((msg, i) => (
              <div key={i} className={msg.role === "user" ? "text-right" : ""}>
                <div
                  className={cn(
                    "inline-block max-w-lg rounded-lg px-3 py-2 text-[12px] leading-relaxed",
                    msg.role === "user" ? "bg-amber-500/10 text-zinc-200" : "bg-white/[0.04] text-zinc-300",
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && <div className="text-[12px] text-zinc-500">Thinking...</div>}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend(chatInput)}
            placeholder="Ask a question about this thesis..."
            className="flex-1 rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <button
            type="button"
            onClick={() => handleSend(chatInput)}
            disabled={!chatInput.trim() || chatLoading}
            className="rounded-md bg-amber-500 px-4 py-2 text-[12px] font-medium text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {/* PART H */}
      {assessment && (
        <div className="mt-8 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Thesis assessment</p>
          <p className="mt-2 text-[13px] font-medium text-zinc-200">{assessment.headline}</p>
          <div className="mt-4 space-y-3 text-[12px] leading-relaxed">
            {assessment.context && (
              <div>
                <span className="text-zinc-500">Context ·</span>{" "}
                <span className="text-zinc-400">{assessment.context}</span>
              </div>
            )}
            {assessment.considerations && (
              <div>
                <span className="text-zinc-500">Considerations ·</span>{" "}
                <span className="text-zinc-400">{assessment.considerations}</span>
              </div>
            )}
            {assessment.riskFactors && (
              <div>
                <span className="text-zinc-500">Risk factors ·</span>{" "}
                <span className="text-zinc-400">{assessment.riskFactors}</span>
              </div>
            )}
            {assessment.whyThisThesisExists && (
              <div>
                <span className="text-zinc-500">Why this thesis exists ·</span>{" "}
                <span className="text-zinc-400">{assessment.whyThisThesisExists}</span>
              </div>
            )}
            {assessment.convictionRationale && (
              <div>
                <span className="text-zinc-500">Conviction rationale ·</span>{" "}
                <span className="text-zinc-400">{assessment.convictionRationale}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PART I */}
      <div className="mt-8 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Trade plan</p>
            <p className="text-[10px] text-zinc-600">{thesis.tradePlan.status}</p>
          </div>
          <span className="text-[10px] text-zinc-600">
            Live levels from DEPTH4 — see Trade above for how to execute when your setup fires.
          </span>
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">
          Estimated from the latest daily close and recent volatility (ATR) — not a broker quote or guaranteed fill.
        </p>

        <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
          <p className="text-[11px] text-red-400/80">{thesis.tradePlan.rrWarning}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Entry zone</p>
            <p className="mt-1 text-[14px] font-medium text-zinc-200">{thesis.tradePlan.entryZone}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Stop</p>
            <p
              className={cn(
                "mt-1 text-[14px] font-medium",
                thesis.tradePlan.stopColor === "red" ? "text-red-400" : "text-zinc-200",
              )}
            >
              {thesis.tradePlan.stop}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Target 1</p>
            <p className="mt-1 text-[14px] font-medium text-emerald-400">{thesis.tradePlan.target1}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Target 2</p>
            <p className="mt-1 text-[14px] font-medium text-emerald-400">{thesis.tradePlan.target2}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Time horizon</p>
            <p className="mt-1 text-[13px] text-zinc-300">{thesis.tradePlan.timeHorizon}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Recommendation</p>
            <p
              className={cn("mt-1 text-[13px] font-medium", {
                "text-emerald-400": thesis.tradePlan.recommendationColor === "emerald",
                "text-amber-400": thesis.tradePlan.recommendationColor === "amber",
                "text-red-400": thesis.tradePlan.recommendationColor === "red",
              })}
            >
              {thesis.tradePlan.recommendation}
            </p>
          </div>
        </div>
      </div>

      {/* PART J */}
      <div className="mt-8 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Insider Flow monitoring (system)
        </p>
        <p className="text-[10px] text-zinc-600">Pre-configured for this catalog thesis — read only.</p>

        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Bull instruments</p>
            <div className="flex flex-wrap gap-1.5">
              {thesis.insiderFlow.bullInstruments.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Bear instruments</p>
            <div className="flex flex-wrap gap-1.5">
              {thesis.insiderFlow.bearInstruments.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Confirm tags</p>
            <div className="flex flex-wrap gap-1.5">
              {thesis.insiderFlow.confirmTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Contradict tags</p>
            <div className="flex flex-wrap gap-1.5">
              {thesis.insiderFlow.contradictTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1 text-[11px] text-red-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* PART K */}
      <div className="mt-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Evidence timeline</p>
        {evidence.length === 0 ? (
          <p className="mt-2 text-[12px] text-zinc-600">No evidence entries yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {evidence.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-3">
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                  <span>{item.source}</span>
                  <span>·</span>
                  <span>{item.timestamp}</span>
                </div>
                <p className="mt-1 text-[12px] font-medium text-zinc-200">{item.title}</p>
                {item.body && <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{item.body}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Outcome &amp; history</p>
          <Link href="/book" className="text-[11px] text-amber-400 transition-colors hover:text-amber-300">
            Book →
          </Link>
        </div>

        {positions && (
          <p className="mt-2 text-[12px] text-zinc-500">
            Linked trades (session) ·{" "}
            <span className="text-zinc-300">
              {positions.open} open · {positions.closed} closed (full exits)
            </span>
          </p>
        )}

        <p className="mt-2 max-w-lg text-[11px] text-zinc-600">
          Mark how you are retiring this idea in this browser. This does not change your broker — it ties the thesis
          story to your Book review.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              await fetch(`/api/theses/${slug}/resolve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ outcome: "resolved" }),
              });
              await refetchPositions();
            }}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            Mark resolved
          </button>
          <button
            type="button"
            onClick={async () => {
              await fetch(`/api/theses/${slug}/resolve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ outcome: "invalidated" }),
              });
              await refetchPositions();
            }}
            className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
          >
            Mark invalidated
          </button>
          <button
            type="button"
            onClick={async () => {
              await fetch(`/api/theses/${slug}/clear-outcome`, { method: "POST" });
              await refetchPositions();
            }}
            className="rounded-md border border-white/[0.06] px-3 py-1.5 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Clear session outcome
          </button>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Related assets</p>
        <div className="space-y-2">
          {thesis.relatedAssets.map((asset) => (
            <div
              key={asset.symbol}
              className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-zinc-900/30 p-3"
            >
              <div>
                <p className="text-[13px] font-medium text-zinc-200">{asset.symbol}</p>
                <p className="text-[10px] text-zinc-500">{asset.type}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
