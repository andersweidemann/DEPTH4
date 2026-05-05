"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  FeedViewModel,
  FeedVerification,
  LeadListItem,
  LeadTrafficLight,
  PricedInLevel,
  TransmissionPly,
} from "@/lib/feed-model";
import { cn } from "@/lib/utils";
import { ArrowDown, X } from "lucide-react";
import { SigBadge } from "@/components/ui/badge";
import { DeepBriefPanel } from "@/components/DeepBriefPanel";
import type { DeepBrief } from "@/types/deepBrief";
import type { Plan } from "@/lib/plan";
import { PLAN_LIMITS, canAccessDepth } from "@/lib/plan";
import { PaywallOverlay } from "@/components/PaywallOverlay";
import {
  buildDepthClockData,
  layer1FromView,
  relTime,
  sourcePillClass,
} from "@/lib/depth4View";
import type { NewsItem } from "@/app/dashboard/types";

const LEAD_LIGHTS_STORAGE = "depth4.leadLights.v1";

type LeadStore = Record<string, LeadTrafficLight[]>;

function readLeadStore(): LeadStore {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LEAD_LIGHTS_STORAGE) || "{}") as LeadStore;
  } catch {
    return {};
  }
}

function nextLight(c: LeadTrafficLight): LeadTrafficLight {
  const o: Record<LeadTrafficLight, LeadTrafficLight> = { red: "yellow", yellow: "green", green: "red" };
  return o[c];
}

function leadLightClass(light: LeadTrafficLight): string {
  switch (light) {
    case "green":
      return "d4-btag d4-btag--impact";
    case "red":
      return "d4-btag d4-btag--hot";
    default:
      return "d4-btag d4-btag--energy";
  }
}

function boldLineFromMarkdown(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return line;
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

const PRICED: Record<PricedInLevel, { abbr: string; line: string }> = {
  not_priced_in: { abbr: "▲", line: "Edge left" },
  partial: { abbr: "~", line: "Partly in price" },
  priced_in: { abbr: "●", line: "Mostly priced" },
  unknown: { abbr: "…", line: "Not scored" },
};

function edgeStyle(score: number) {
  const a = 0.1 + (score / 100) * 0.9;
  const l = 36 + (score / 100) * 20;
  const bar = `hsl(38,${38 + score * 0.55}%,${l}%)`;
  const col = `hsla(38,80%,${l + 8}%,${a})`;
  const glow = score > 65 ? `0 0 5px hsla(38,90%,55%,${(score - 65) / 120})` : "none";
  return { bar, col, glow };
}

function DepthClock({
  urgency,
  horizon,
  recs,
  brokerLinks,
}: {
  urgency: number;
  horizon: string;
  recs: { tick: string; act: string; edge: number; thesis: string }[];
  brokerLinks: boolean;
}) {
  const [openTick, setOpenTick] = useState<string | null>(null);
  const r = 56;
  const cx = 70;
  const cy = 70;
  const stroke = 8;
  const circ = 2 * Math.PI * r;
  const pct = urgency / 100;
  const clr = urgency > 70 ? "var(--d4-red)" : urgency > 45 ? "var(--d4-gold)" : "var(--d4-green)";

  return (
    <div className="d4-dc-wrap">
      <svg className="d4-dc-svg" viewBox="0 0 140 140" aria-label={`Urgency ${urgency} of 100`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--d4-s4)" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={clr}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
        <text x={cx} y={cy + 2} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--font-cabinet, 'Cabinet Grotesk', sans-serif)", fontSize: 22, fontWeight: 700, fill: clr }}>
          {urgency}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 9, fill: "var(--d4-muted)" }}>
          URGENCY
        </text>
      </svg>
      <div style={{ fontSize: 11, color: "var(--d4-muted)", textAlign: "center", marginTop: -6 }}>
        Horizon: <strong style={{ color: "var(--d4-text)" }}>{horizon}</strong>
      </div>
      <div className="d4-dc-recs">
        {recs.map((rec) => {
          const s = edgeStyle(rec.edge);
          const actc = rec.act === "buy" ? "d4-dc-act--buy" : rec.act === "avoid" ? "d4-dc-act--avoid" : "d4-dc-act--watch";
          return (
            <div key={rec.thesis.slice(0, 24) + rec.tick} className="d4-dc-rec">
              <div className="d4-dc-tick" style={{ color: s.col, textShadow: s.glow }}>{rec.tick}</div>
              <span className={cn("d4-dc-act", actc)}>{rec.act.toUpperCase()}</span>
              <div className="d4-dc-thesis">{rec.thesis}</div>
              <div className="d4-dc-edge" style={{ color: s.col }}>{rec.edge}</div>
              <div style={{ marginTop: 8, position: "relative" }}>
                {brokerLinks ? (
                  <button
                    type="button"
                    className="d4-btn d4-btn-ghost"
                    style={{ fontSize: 11, padding: "5px 10px", borderColor: "var(--d4-border)" }}
                    onClick={() => setOpenTick((cur) => (cur === rec.tick ? null : rec.tick))}
                  >
                    Execute →
                  </button>
                ) : (
                  <span className="pw-exec-hint d4-bubble-meta" style={{ fontSize: 11, color: "var(--d4-muted)" }}>
                    🔒 Upgrade to execute
                  </span>
                )}
                {openTick === rec.tick && (
                  <div
                    className="d4-dm-block"
                    style={{
                      position: "absolute",
                      top: 34,
                      left: 0,
                      right: 0,
                      zIndex: 5,
                      background: "var(--d4-s3)",
                      border: "1px solid var(--d4-border)",
                      padding: 10,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        ["Avanza", "https://www.avanza.se"],
                        ["Nordnet", "https://www.nordnet.se"],
                        ["IBKR", "https://www.interactivebrokers.com"],
                      ].map(([name, url]) => (
                        <a
                          key={name}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="d4-btn d4-btn-ghost"
                          style={{ justifyContent: "center" }}
                        >
                          {name}
                        </a>
                      ))}
                    </div>
                    <p className="d4-bubble-meta" style={{ fontSize: 11, margin: "8px 0 0", color: "var(--d4-muted)" }}>
                      DEPTH4 does not execute trades. Links open your broker&apos;s platform.
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PRICED_NEWS_IN_STOCK_TIP_D4 =
  "Approximate share of this headline’s tradable information already reflected in this symbol (model estimate; not a price target or advice).";

function PlyPriced({ p }: { p: TransmissionPly }) {
  const pi = PRICED[p.pricedIn];
  return (
    <div style={{ marginTop: 6 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: "var(--d4-faint)" }}>Priced in yet?</p>
      <span
        className="d4-btag"
        title={p.pricedIn === "unknown" ? undefined : p.pricedIn}
        style={{ display: "inline-block", marginTop: 4 }}
      >
        {p.pricedIn === "unknown" ? "… model did not set" : (
          <>{pi.abbr} {pi.line}</>
        )}
      </span>
      {p.stockIdeas.length > 0 && (
        <ul style={{ margin: "6px 0 0", padding: "8px 10px", listStyle: "none", background: "var(--d4-s4)", borderRadius: 6, border: "1px solid var(--d4-border)" }}>
          {p.stockIdeas.map((s) => (
            <li key={s.ticker} style={{ fontSize: 12, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 10px" }}>
              <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                <strong style={{ color: "var(--d4-gold)" }}>{s.ticker}</strong>
                {s.newsPricedInPct != null ? (
                  <span
                    title={PRICED_NEWS_IN_STOCK_TIP_D4}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--d4-text)",
                      background: "var(--d4-s4)",
                      border: "1px solid rgba(245, 158, 11, 0.45)",
                      borderRadius: 999,
                      padding: "2px 8px",
                    }}
                  >
                    {s.newsPricedInPct}%
                  </span>
                ) : (
                  <span title={PRICED_NEWS_IN_STOCK_TIP_D4} style={{ fontSize: 10, fontFamily: "monospace", color: "var(--d4-muted)" }}>
                    —%
                  </span>
                )}
              </span>
              <span style={{ color: "var(--d4-muted)" }}>— {s.note}</span>
            </li>
          ))}
        </ul>
      )}
      {p.buyTrigger ? (
        <p
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--d4-text)",
            borderLeft: "2px solid var(--d4-blue)",
            padding: "4px 8px",
            background: "var(--d4-s4)",
            borderRadius: "0 4px 4px 0",
          }}
        >
          <span style={{ color: "var(--d4-blue)" }}>Before buying: </span>
          {p.buyTrigger}
        </p>
      ) : null}
    </div>
  );
}

function LeadListD4({ eventId, modelRows }: { eventId: string; modelRows: LeadListItem[] }) {
  const [rows, setRows] = useState<LeadListItem[]>(() => modelRows);
  const textKey = modelRows.length ? modelRows.map((r) => r.text).join("|\0|") : "";

  useEffect(() => {
    if (!textKey) {
      setRows(modelRows);
      return;
    }
    const s = readLeadStore()[eventId];
    if (!s || s.length !== modelRows.length) {
      setRows(modelRows.map((r) => ({ ...r })));
      return;
    }
    setRows(
      modelRows.map((r, i) => {
        const x = s[i] as string | undefined;
        if (x === "red" || x === "yellow" || x === "green") return { ...r, light: x };
        return { ...r };
      }),
    );
  }, [eventId, textKey, modelRows]);

  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--d4-divider)" }}>
      <p className="d4-dm-kicker" style={{ color: "var(--d4-faint)" }}>What to watch (tap to cycle R/Y/G)</p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {rows.map((row, j) => (
          <li key={j} className="d4-form-row">
            <button
              type="button"
              className={cn(leadLightClass(row.light), "d4-btn", "w-full", "text-left", "d4-btn-ghost")}
              style={{ justifyContent: "flex-start" }}
              onClick={() => {
                const next: LeadListItem[] = rows.map((r, i) => (i === j ? { ...r, light: nextLight(r.light) } : r));
                setRows(next);
                const st = readLeadStore();
                st[eventId] = next.map((r) => r.light);
                try {
                  localStorage.setItem(LEAD_LIGHTS_STORAGE, JSON.stringify(st));
                } catch { /* */ }
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", display: "inline-block", background: row.light === "green" ? "var(--d4-green)" : row.light === "red" ? "var(--d4-red)" : "var(--d4-gold)" }} />
              {row.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VerificationBlockD4({ v }: { v: FeedVerification }) {
  if (v.status === "unknown" && !v.basis && !v.flagForUser) return null;
  const warn = v.status === "unconfirmed" || (v.flagForUser && v.flagForUser.startsWith("⚠️"));
  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 10px",
        borderRadius: 6,
        fontSize: 11,
        lineHeight: 1.45,
        border: `1px solid ${warn ? "var(--d4-red)" : "var(--d4-border)"}`,
        background: warn ? "rgba(194,82,82,0.12)" : "var(--d4-s4)",
        color: "var(--d4-text)",
      }}
    >
      <span style={{ fontWeight: 700, color: warn ? "var(--d4-red)" : "var(--d4-muted)" }}>
        {v.status === "confirmed" ? "Verified (text-only) " : v.status === "unconfirmed" ? "Unconfirmed " : "Review "}
      </span>
      {v.flagForUser && <span>{v.flagForUser}</span>}
      {!v.flagForUser && v.basis && <span>{v.basis}</span>}
      {v.lastKnownDateHint && (
        <span style={{ display: "block", marginTop: 4, color: "var(--d4-muted)" }}>Date in text: {v.lastKnownDateHint}</span>
      )}
    </div>
  );
}

function ForwardBlockD4({ vm }: { vm: FeedViewModel }) {
  const plies = vm.layer2.transmissionPlies ?? [];
  const leadList = vm.layer2.earlyLeadList;
  const horizon = vm.layer2.forwardHorizonSummary;
  if (!plies.length && !leadList?.length && !horizon?.trim()) return null;
  return (
    <div>
      {plies.length > 0 && (
        <p className="d4-dm-kicker" style={{ marginBottom: 8 }}>Forward — four Depths in a row</p>
      )}
      {plies.length > 0 && (
        <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {plies.map((p, i) => (
            <li key={p.step + String(i)} style={{ borderLeft: "2px solid var(--d4-gold)", paddingLeft: 10, marginBottom: 8 }}>
              <div className="d4-tl-step" style={{ color: "var(--d4-gold)" }}>
                Depth {p.step}
                {p.time_to_effect && p.time_to_effect !== "—" && <span className="d4-tl-time" style={{ marginLeft: 6 }}>· {p.time_to_effect}</span>}
              </div>
              <p style={{ fontSize: 11, color: "var(--d4-muted)" }}>
                <span>From: </span>
                <span style={{ fontWeight: 600, color: "var(--d4-text)" }}>{p.from_state}</span>
              </p>
              <p className="tl-desc" style={{ margin: "4px 0" }}>{p.mechanism}</p>
              <p style={{ fontSize: 11, color: "var(--d4-text)" }}>
                <span style={{ color: "var(--d4-faint)" }}>Then: </span>
                {p.to_state}
              </p>
              {p.lead_indicator && (
                <p className="d4-tl-watch" style={{ marginTop: 6 }}>
                  Watch: {p.lead_indicator}
                </p>
              )}
              <PlyPriced p={p} />
              {i < plies.length - 1 && (
                <div style={{ textAlign: "center", margin: 4 }} aria-hidden>
                  <ArrowDown className="h-3.5 w-3.5" style={{ color: "var(--d4-gold)" }} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {horizon && (
        <p style={{ fontSize: 12, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--d4-divider)" }}>
          <span style={{ color: "var(--d4-gold)", fontWeight: 700 }}>Time window: </span>
          {horizon}
        </p>
      )}
      {leadList && leadList.length > 0 && <LeadListD4 eventId={vm.id} modelRows={leadList} />}
    </div>
  );
}

type TabK = "l1" | "l2" | "l3" | "clock" | "db";
type TabId = "depth1" | "depth2" | "depth3" | "depthClock" | "db";

const DEPTH_TAB_ACCESS: Record<Plan, TabId[]> = {
  free: ["depth1", "depth2"],
  analyst: ["depth1", "depth2", "depth3", "db"],
  pro: ["depth1", "depth2", "depth3", "depthClock", "db"],
};

function scenarioBarClass(s: { label: string; probability: number }, i: number, n: number): "d4-sc-fill" | "d4-sc-fill--flat" | "d4-sc-fill--danger" {
  if (i === 0) return "d4-sc-fill";
  if (i === n - 1 && s.probability < 35) return "d4-sc-fill--danger";
  return n > 1 && i === n - 1 && /scenario\s*c|\bc\b/i.test(s.label) ? "d4-sc-fill--danger" : "d4-sc-fill--flat";
}

function isTail(s: { label: string; probability: number }, i: number, n: number) {
  return (i === n - 1 && s.probability < 35) || (n > 1 && /scenario\s*c/i.test(s.label));
}

function ageMinutes(publishedAt: string | null): number | null {
  if (!publishedAt) return null;
  const d = new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
}

type WindowStatus = "open" | "closing" | "open-long" | "closed";
function getWindowStatus(level: 1 | 2 | 3 | 4, ageMin: number): WindowStatus {
  const limits: Record<1 | 2 | 3 | 4, number> = { 1: 120, 2: 720, 3: 5760, 4: Number.POSITIVE_INFINITY };
  const closing: Record<1 | 2 | 3 | 4, number> = { 1: 60, 2: 360, 3: 2880, 4: Number.POSITIVE_INFINITY };
  if (ageMin > limits[level]) return "closed";
  if (ageMin > closing[level]) return "closing";
  return level >= 3 ? "open-long" : "open";
}

function FeedTags({ vm, publishedAt, overlapLabels }: { vm: FeedViewModel; publishedAt: string | null; overlapLabels: string[] }) {
  const tags: { k: "hot" | "energy" | "impact" | "base"; t: string }[] = [];
  if (vm.verification?.status === "unconfirmed") tags.push({ k: "base", t: "⚠ Unconfirmed" });
  if (vm.signalLevel >= 4) tags.push({ k: "hot", t: "High signal" });
  const h = (vm.headline + vm.hook).toLowerCase();
  if (h.includes("oil") || h.includes("brent") || h.includes("opec") || h.includes("crude") || h.includes("energy")) {
    tags.push({ k: "energy", t: "⛽ Energy" });
  }
  if (overlapLabels.length) tags.push({ k: "impact", t: `Book: ${overlapLabels.slice(0, 3).join("·")}` });
  if (!tags.length) tags.push({ k: "base", t: "Macro" });
  const am = ageMinutes(publishedAt);
  const ws = am == null ? null : getWindowStatus(vm.signalLevel, am);
  const pill =
    ws === "closing"
      ? { text: "Window closing", color: "rgba(226,164,58,0.85)", bg: "rgba(226,164,58,0.10)" }
      : ws === "open-long"
        ? vm.signalLevel === 4
          ? { text: "Long window", color: "rgba(120,167,255,0.9)", bg: "rgba(120,167,255,0.10)" }
          : { text: "Window open", color: "rgba(120,220,170,0.9)", bg: "rgba(120,220,170,0.10)" }
        : null;
  return (
    <div className="d4-bubble-tags">
      {tags.map((x) => (
        <span
          key={x.t + x.k}
          className={x.k === "base" ? "d4-btag" : `d4-btag d4-btag--${x.k}`}
        >
          {x.t}
        </span>
      ))}
      <span className="d4-btag" style={{ color: "var(--d4-muted)" }}>{relTime(publishedAt)}</span>
      {pill && (
        <span
          className="d4-btag"
          style={{
            color: pill.color,
            background: pill.bg,
            borderColor: "rgba(255,255,255,0.10)",
          }}
          title="Trade window is a heuristic (not advice)"
        >
          {pill.text}
        </span>
      )}
    </div>
  );
}

export function Depth4FeedBubble({
  news,
  model,
  expanded,
  onToggle,
  onFocus,
  onDismiss,
  plan,
  publishedAt,
  overlapLabelTickers,
  userHoldings,
  onUpgrade,
  isGeneratingBrief,
  briefError,
  onGenerateBrief,
  isIncoming,
  trigger,
  onDismissTrigger,
  isBookmarked,
  onToggleBookmark,
  tracked,
}: {
  news: NewsItem;
  model: FeedViewModel;
  expanded: boolean;
  onToggle: () => void;
  onFocus: () => void;
  onDismiss?: () => void;
  plan: Plan;
  publishedAt: string | null;
  overlapLabelTickers: string[];
  userHoldings: string[];
  onUpgrade: () => void;
  isGeneratingBrief?: boolean;
  briefError?: string | null;
  onGenerateBrief?: () => void;
  isIncoming?: boolean;
  trigger?: { tone: "gold" | "red"; text: string } | null;
  onDismissTrigger?: () => void;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  tracked?: boolean;
}) {
  const [tab, setTab] = useState<TabK>("l1");
  const l1 = layer1FromView(model);
  const d1 = model.layer2.depth1;
  const d2 = model.layer2.depth2;
  const hasStructuredD1 = Boolean(d1?.event || d1?.whyItMatters || d1?.firstMove || d1?.pricedIn);
  const hasStructuredD2 = Boolean(d2?.sectorRipple || (d2?.timeline && d2.timeline.length) || d2?.crossAsset);
  const hasL3 = model.layer3.scenarios.length > 0;
  const clock = buildDepthClockData(model, news.signal_level);
  const sl = model.signalLevel;
  const brief = (news as NewsItem & { deepBrief?: DeepBrief }).deepBrief;
  const depth3Unlocked = canAccessDepth(plan, 3);
  const clockUnlocked = plan === "pro";
  const deepBriefAccess = PLAN_LIMITS[plan].deepBrief;
  const brokerLinks = PLAN_LIMITS[plan].brokerLinks;
  const am = ageMinutes(publishedAt);
  const ws = am == null ? null : getWindowStatus(sl, am);
  const closed = ws === "closed";
  const trigTone = trigger?.tone;

  const onOpen = useCallback(() => {
    onFocus();
    onToggle();
  }, [onFocus, onToggle]);

  return (
    <div
      className={cn("d4-bubble", expanded && "d4-bubble--active", isIncoming && "incoming", tracked && "tracked")}
      style={{
        ...(sl >= 4
          ? { boxShadow: "0 0 0 1px rgba(194, 82, 82, 0.35)" }
          : sl === 3
            ? { boxShadow: "0 0 0 1px rgba(226, 164, 58, 0.3)" }
            : {}),
        ...(closed ? { opacity: 0.6 } : {}),
        ...(trigTone === "gold" ? { borderColor: "var(--d4-goldring)" } : {}),
        ...(trigTone === "red" ? { borderColor: "rgba(194,82,82,.35)" } : {}),
      }}
    >
      <div
        className="d4-bubble-top"
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <span className={cn("d4-bubble-src", sourcePillClass(news.source))}>
          {news.source || "Wire"}
        </span>
        {isIncoming && <span className="d4-new-badge">NEW</span>}
        <div className="d4-bubble-content" style={{ minWidth: 0 }}>
          <div className="d4-bubble-title" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {model.headline}
            <SigBadge className="!shrink-0" level={sl} />
            {brief && (
              <span
                className="d4-btag"
                style={{ color: "var(--d4-gold)", borderColor: "rgba(226,164,58,0.35)", background: "rgba(226,164,58,0.10)", fontSize: 10 }}
                title="Deep Brief available — click to read"
              >
                ⚡ Brief
              </span>
            )}
          </div>
          <div className="d4-bubble-meta" style={{ marginTop: 4, flexWrap: "wrap" }}>
            <em style={{ color: "var(--d4-text)", fontStyle: "normal" }}>→ {model.hook}</em>
          </div>
          {model.verification && <VerificationBlockD4 v={model.verification} />}
        </div>
        {onDismiss && (
          <button
            type="button"
            className="d4-btn d4-btn-ghost"
            style={{ padding: 4, minWidth: 32, flexShrink: 0 }}
            title="Not interested"
            onClick={(ev) => {
              ev.stopPropagation();
              onDismiss();
            }}
            aria-label="Not interested"
          >
            <X className="h-4 w-4" style={{ color: "var(--d4-muted)" }} />
          </button>
        )}
        <button
          type="button"
          className={cn("bookmark-btn", isBookmarked && "bookmarked")}
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark?.();
          }}
          title={isBookmarked ? "Stop tracking" : "Track this story"}
          aria-label={isBookmarked ? "Stop tracking" : "Track this story"}
        >
          {isBookmarked ? "★" : "☆"}
        </button>
        <span className="d4-caret-hint" aria-hidden>▼</span>
      </div>
      <FeedTags vm={model} publishedAt={publishedAt} overlapLabels={overlapLabelTickers} />

      {trigger?.text && (
        <div className={cn("watch-trigger-bar", trigger.tone)}>
          <span
            className="trigger-dot"
            aria-hidden
            style={{ background: trigger.tone === "red" ? "var(--d4-red)" : "var(--d4-gold)" }}
          />
          <span style={{ color: "inherit" }}>{trigger.text}</span>
          <button
            type="button"
            className="watch-trigger-dismiss"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              onDismissTrigger?.();
            }}
          >
            ×
          </button>
        </div>
      )}

      <div className="d4-depth-map" id={`dm-${model.id}`}>
        <div className="d4-dm-tabs" role="tablist">
          {(
            [
              ["l1", "L1 — Event", "Direct impact"],
              ["l2", "L2 — Story", "Sector ripple"],
              ["l3", "L3 — Scenarios", "Macro cascade"],
              ["clock", "L4 — Clock", "Structural drift"],
              ["db", "Deep Brief", "Trade-ready"],
            ] as [TabK, string, string][]
          ).map(([k, label, sub]) => {
            const tabId: TabId =
              k === "l1" ? "depth1" :
                k === "l2" ? "depth2" :
                  k === "l3" ? "depth3" :
                    k === "clock" ? "depthClock" : "db";
            const allowed = DEPTH_TAB_ACCESS[plan].includes(tabId);
            return (
              <button
                key={k}
                type="button"
                role="tab"
                className={cn("d4-dm-tab", tab === k && "d4-dm-tab--active")}
                aria-selected={tab === k}
                onClick={(e) => {
                  e.stopPropagation();
                  onFocus();
                  setTab(k);
                }}
                style={allowed ? undefined : { opacity: 0.55 }}
                title={allowed ? undefined : "Locked — upgrade to unlock"}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                  <span>{label}</span>
                  {!allowed && <span aria-hidden style={{ fontSize: 12, transform: "translateY(-1px)" }}>🔒</span>}
                </span>
                <span style={{ display: "block", fontSize: 10, marginTop: 2, color: "var(--d4-faint)" }}>{sub}</span>
              </button>
            );
          })}
        </div>
        <div className="d4-bubble-meta" style={{ marginTop: 8, fontSize: 11, lineHeight: 1.35 }}>
          <strong style={{ color: "var(--d4-text)", fontWeight: 600 }}>How to read it</strong>:{" "}
          <span style={{ color: "var(--d4-muted)" }}>
            Depth 1 = what just changed. Depth 2 = how it propagates into other markets (timing + priced‑in). Depth 3 =
            branching scenarios + what would confirm each path.
          </span>
        </div>

        <div className={cn("d4-dm-panel", tab === "l1" && "d4-dm-panel--active")} role="tabpanel" aria-hidden={tab !== "l1"}>
          {hasStructuredD1 ? (
            <>
              <div className="d4-dm-kicker">EVENT</div>
              <div className="d4-dm-block">{d1?.event || l1.event}</div>
              <div className="d4-dm-kicker" style={{ marginTop: 8 }}>WHY IT MATTERS</div>
              <div className="d4-dm-block">{d1?.whyItMatters || l1.why}</div>
              <div className="d4-dm-kicker" style={{ marginTop: 8 }}>FIRST MOVE</div>
              <div className="d4-dm-block">{d1?.firstMove || l1.next}</div>
              <div className="d4-dm-kicker" style={{ marginTop: 8 }}>PRICED IN</div>
              <div className="d4-dm-block">{d1?.pricedIn || l1.signal}</div>
            </>
          ) : (
            <>
              <div className="d4-dm-kicker">Event</div>
              <div className="d4-dm-block">{l1.event}</div>
              <div className="d4-dm-kicker" style={{ marginTop: 8 }}>Why</div>
              <div className="d4-dm-block">{l1.why}</div>
              <div className="d4-dm-kicker" style={{ marginTop: 8 }}>Next</div>
              <div className="d4-dm-block">{l1.next}</div>
              <div className="d4-dm-signal">{l1.signal}</div>
            </>
          )}
        </div>

        <div className={cn("d4-dm-panel", tab === "l2" && "d4-dm-panel--active")} role="tabpanel" aria-hidden={tab !== "l2"}>
          {hasStructuredD2 ? (
            <div>
              <p className="d4-dm-kicker">SECTOR RIPPLE</p>
              <div className="d4-dm-block" style={{ fontSize: 12, lineHeight: 1.55 }}>
                {d2?.sectorRipple || "—"}
              </div>

              <p className="d4-dm-kicker" style={{ marginTop: 10 }}>TIMELINE</p>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 10 }}>
                {(d2?.timeline || []).slice(0, 3).map((step, i) => (
                  <div key={`${step.step || i}-${i}`} className="d4-dm-block" style={{ borderLeft: "2px solid var(--d4-gold)", paddingLeft: 10 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "var(--d4-text)", margin: 0 }}>Step {i + 1} · {step.step || "—"}</p>
                    <p style={{ fontSize: 12, color: "var(--d4-text)", margin: "6px 0 0", lineHeight: 1.55 }}>
                      {step.impact || "—"}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--d4-muted)", margin: "6px 0 0", lineHeight: 1.55 }}>
                      {step.watch || "—"}
                    </p>
                  </div>
                ))}
              </div>

              <p className="d4-dm-kicker" style={{ marginTop: 10 }}>CROSS-ASSET</p>
              <div className="d4-dm-block" style={{ fontSize: 12, lineHeight: 1.55 }}>
                {d2?.crossAsset || "—"}
              </div>
            </div>
          ) : (
            <>
              {/* Fallback: only show forward propagation blocks (avoid repeating the same narrative as Depth 1). */}
              <ForwardBlockD4 vm={model} />
              {/* If ForwardBlockD4 has nothing, show the story chain as last resort. */}
              {(!model.layer2.transmissionPlies?.length && !(model.layer2.earlyLeadList?.length) && !(model.layer2.forwardHorizonSummary?.trim())) && (
                <div>
                  <div>
                    {model.layer2.chain.map((s, i) => (
                      <div key={i}>
                        {i > 0 && <div className="d4-tl-item" style={{ border: "none", padding: 4, justifyContent: "center" }}><ArrowDown className="h-4 w-4 mx-auto" style={{ color: "var(--d4-muted)" }} /></div>}
                        <p className="d4-tl-step">{s.title}</p>
                        <p className="tl-desc">{s.text}</p>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3, borderTop: "1px solid var(--d4-divider)", marginTop: 8, paddingTop: 8 }}>
                    {model.layer2.verdict}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className={cn("d4-dm-panel", tab === "l3" && "d4-dm-panel--active")} role="tabpanel" aria-hidden={tab !== "l3"}>
          {depth3Unlocked && hasL3 && (
            <div className="d4-sc-tree">
              {model.layer3.scenarios.map((s, i, arr) => {
                if (typeof window !== "undefined") {
                  // Temporary debug to confirm variability (remove later).
                  console.log(
                    "[D3 probs]",
                    model.layer3.scenarios.map((ss) => `${ss.label}: ${ss.probability}%`),
                  );
                }
                const tail = isTail(s, i, arr.length);
                const fill = scenarioBarClass(s, i, arr.length);
                return (
                  <div
                    className={cn("d4-sc-node", tail && "d4-sc-node--tail")}
                    key={s.id}
                  >
                    <div className="d4-sc-nh">
                      <div>
                        <div className={cn("d4-sc-lbl", tail && "d4-sc-lbl--tail")}>{s.label}</div>
                        <div className="d4-sc-sub">{s.outcome.slice(0, 100)}{s.outcome.length > 100 ? "…" : ""}</div>
                      </div>
                      <div className="d4-sc-prob" style={{ textAlign: "right" }}>
                        <div>{s.probability}%</div>
                        <div style={{ fontSize: 11, color: "rgba(226,164,58,0.80)", marginTop: 2 }}>
                          ~{Math.round(s.probability * 0.6)}% of this move is unpriced
                        </div>
                      </div>
                    </div>
                    <div className="d4-sc-bar" aria-hidden>
                      <div className={cn("d4-sc-fill", fill)} style={{ width: `${s.probability}%` }} />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--d4-muted)", marginBottom: 6 }}>{s.marketImpact}</div>
                    {(s.winners.length > 0 || s.losers.length > 0) && (
                      <div className="d4-sc-chips">
                        {s.winners.map((t) => (
                          <span key={t} className="d4-sc-chip--win">{t}</span>
                        ))}
                        {s.losers.map((t) => (
                          <span key={t} className="d4-sc-chip--lose">{t}</span>
                        ))}
                      </div>
                    )}
                    {s.oneWatch && (
                      <div className={cn("d4-sc-watch", tail && "d4-sc-watch--danger")}>
                        Watch: {String(s.oneWatch || "").replace(/^\s*watch:\s*/i, "")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {depth3Unlocked && hasL3 && model.layer3.watchList.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--d4-divider)" }}>
              <p className="d4-dm-kicker" style={{ color: "var(--d4-faint)" }}>Watch list (triggers)</p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, fontSize: 12, color: "var(--d4-text)" }}>
                {model.layer3.watchList.map((w, i) => (
                  <li key={i} className="d4-sig">
                    {w.kind === "confirmA" && <span className="d4-sdot d4-sdot--g" aria-hidden />}
                    {w.kind === "activateC" && <span className="d4-sdot d4-sdot--r" aria-hidden />}
                    {w.kind === "wait" && <span className="d4-sdot d4-sdot--y" aria-hidden />}
                    <span>{boldLineFromMarkdown(w.line)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {depth3Unlocked && !hasL3 && (
            <div style={{ color: "var(--d4-muted)", fontSize: 13, lineHeight: 1.55 }}>
              {sl < 3 ? (
                <>
                  <p style={{ margin: 0 }}>
                    Scenarios are only built for <strong>higher-signal</strong> items (badge <strong>≥3</strong>). This
                    story is rated lower, so Depth 3 stays empty on purpose.
                  </p>
                  <p style={{ margin: "10px 0 0" }}>Open a headline with a higher signal, or wait for a bigger wire.</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0 }}>
                    No scenario branches are stored for this item yet (ingest may still be writing the tree, or
                    generation returned an empty list).
                  </p>
                  <p style={{ margin: "10px 0 0" }}>
                    Use <strong>Refresh</strong> on the dashboard in a little while, or try another <strong>≥3</strong>{" "}
                    item.
                  </p>
                </>
              )}
            </div>
          )}
          {!depth3Unlocked && (
            <div style={{ position: "relative", minHeight: 220 }}>
              <div style={{ filter: "blur(5px)", opacity: 0.45, maxHeight: 220, overflow: "hidden" }}>
                <div className="d4-dm-kicker" style={{ color: "var(--d4-faint)" }}>Scenarios</div>
                <div className="d4-dm-block" style={{ marginTop: 8 }}>
                  Unlock Depth 3 to see scenario branches + confirmation triggers.
                </div>
              </div>
              <PaywallOverlay
                requiredPlan="analyst"
                featureName="Depth 3 — Scenarios"
                currentPlan={plan}
                subtitle="Depth 3 is available on Analyst and Pro."
                onUpgrade={onUpgrade}
              />
            </div>
          )}
        </div>

        <div className={cn("d4-dm-panel", tab === "clock" && "d4-dm-panel--active")} role="tabpanel" aria-hidden={tab !== "clock"}>
          {clockUnlocked && <DepthClock {...clock} brokerLinks={brokerLinks} />}
          {!clockUnlocked && (
            <div style={{ position: "relative", minHeight: 220 }}>
              <div style={{ filter: "blur(5px)", opacity: 0.45, maxHeight: 220, overflow: "hidden" }}>
                <div className="d4-dm-kicker" style={{ color: "var(--d4-faint)" }}>Depth Clock</div>
                <div className="d4-dm-block" style={{ marginTop: 8 }}>
                  Timing, urgency, and execution links.
                </div>
              </div>
              <PaywallOverlay
                requiredPlan="pro"
                featureName="Depth Clock"
                currentPlan={plan}
                subtitle="Depth Clock is available on Pro."
                onUpgrade={onUpgrade}
              />
            </div>
          )}
        </div>

        <div className={cn("d4-dm-panel", tab === "db" && "d4-dm-panel--active")} role="tabpanel" aria-hidden={tab !== "db"}>
          <DeepBriefPanel
            brief={brief}
            userHoldings={userHoldings}
            plan={plan}
            briefAccess={deepBriefAccess}
            onUpgradeAnalyst={onUpgrade}
            onUpgradePro={onUpgrade}
            isGenerating={isGeneratingBrief}
            error={briefError}
            onGenerate={onGenerateBrief}
          />
        </div>
      </div>
    </div>
  );
}
