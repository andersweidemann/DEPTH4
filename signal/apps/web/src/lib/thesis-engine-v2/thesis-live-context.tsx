"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { ThesisAlertImpact } from "@/lib/thesis-engine-v2/thesis-alert-types";

export type { ThesisAlertImpact } from "@/lib/thesis-engine-v2/thesis-alert-types";
import { mergeThesis } from "@/lib/thesis-engine-v2/thesis-merge";
import { MOCK_LIVE_SIGNAL_TICKER, MOCK_THESES, sortThesesForDashboard } from "@/lib/thesis-engine-v2/mock-data";
import { loadPositions } from "@/lib/thesis-engine-v2/positions-store";
import {
  DEPTH4_THESIS_OUTCOMES_CHANGED,
  getThesisOutcome,
  setThesisOutcome,
} from "@/lib/thesis-engine-v2/thesis-outcomes-store";
import { createMockThesisStream } from "@/lib/thesis-engine-v2/thesis-mock-stream";
import { runMockThesisTick } from "@/lib/thesis-engine-v2/thesis-mock-tick";
import type { Overrides } from "@/lib/thesis-engine-v2/thesis-mock-tick";
import type { LiveSignalTickerItem, Thesis } from "@/lib/thesis-engine-v2/types";
import { loadUserTheses } from "@/lib/thesis-engine-v2/user-theses";
import type { InsiderFlowAnomaly } from "@/lib/thesis-engine-v2/insider-flow/types";
import type { InsiderFlowPatternType, InsiderFlowStatus } from "@/lib/thesis-engine-v2/insider-flow/types";
import { useV2Plan } from "@/lib/thesis-engine-v2/use-plan";
import { createClient as createSbClient } from "@/lib/supabase/client";

const STAR_KEY = "depth4.v2.starred.v1";
const MAX_TICKER = 14;
const MAX_ALERTS = 20;
const PREF_KEY = "depth4.v2.notify.prefs.v1";
const LIVE_EVIDENCE_POLL_MS = 20_000;

type NotifyPref = "any" | "major" | "consequence" | "mute";

export type ThesisEvidenceLogRow = {
  id: string;
  createdAt: number;
  thesisId: string;
  eventType: string;
  description: string;
  probabilityBefore: { base: number; bull: number; bear: number } | null;
  probabilityAfter: { base: number; bull: number; bear: number } | null;
  metadata: Record<string, unknown> | undefined;
};

export type ThesisAlertEntry = {
  id: string;
  createdAt: number;
  thesisId: string;
  thesisTitle: string;
  type: "probability_change" | "consequence_change" | "invalidation" | "system";
  scenario?: "base" | "bull" | "bear";
  oldProbability?: number;
  newProbability?: number;
  confirmText: string;
  consequenceText: string;
  read: boolean;
  impact: ThesisAlertImpact;
};

function loadPrefs(): Record<string, NotifyPref> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(PREF_KEY);
    const j = raw ? (JSON.parse(raw) as unknown) : null;
    if (!j || typeof j !== "object") return {};
    const out: Record<string, NotifyPref> = {};
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      if (v === "any" || v === "major" || v === "consequence" || v === "mute") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function savePrefs(next: Record<string, NotifyPref>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PREF_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function loadStarred(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(STAR_KEY);
    const j = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(j)) return new Set();
    return new Set(j.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveStarred(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STAR_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

function openPositionThesisIds(): Set<string> {
  const ids = new Set<string>();
  for (const p of loadPositions()) {
    if (p.tradeStatus === "open") ids.add(p.linkedThesisId);
  }
  return ids;
}

function applyManualOutcome(t: Thesis): Thesis {
  const o = getThesisOutcome(t.id);
  if (!o) return t;
  const when = new Date(o.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  if (o.status === "resolved") {
    return { ...t, status: "resolved", advisoryAction: "exit", lastUpdated: `Marked resolved · ${when} (session)` };
  }
  return { ...t, status: "invalidated", advisoryAction: "exit", lastUpdated: `Marked invalidated · ${when} (session)` };
}

function newAlertId(): string {
  return `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function resolveThesisTitle(thesisId: string): string {
  const sys = MOCK_THESES.find((t) => t.id === thesisId);
  if (sys) return sys.title;
  const u = loadUserTheses().find((t) => t.id === thesisId);
  if (u) return u.title;
  return "Thesis";
}

function baseThesisForId(thesisId: string): Thesis | undefined {
  return MOCK_THESES.find((t) => t.id === thesisId) ?? loadUserTheses().find((t) => t.id === thesisId);
}

function scenarioProbPatchFromDb(baseThesis: Thesis, p: { base: number; bull: number; bear: number }): Partial<Thesis> {
  const o = baseThesis.scenarioOverrides;
  return {
    scenarioOverrides: {
      base: {
        probability: p.base,
        confirmation: o?.base?.confirmation ?? "",
        marketConsequence: o?.base?.marketConsequence ?? "",
      },
      bull: {
        probability: p.bull,
        confirmation: o?.bull?.confirmation ?? "",
        marketConsequence: o?.bull?.marketConsequence ?? "",
      },
      bear: {
        probability: p.bear,
        confirmation: o?.bear?.confirmation ?? "",
        marketConsequence: o?.bear?.marketConsequence ?? "",
      },
    },
  };
}

function leadScenarioOf(p: { base: number; bull: number; bear: number }) {
  return (["base", "bull", "bear"] as const).reduce((best, k) => (p[k] > p[best] ? k : best), "base");
}

type Toast = { id: string; message: string } | null;

type Ctx = {
  mergeThesis: (t: Thesis) => Thesis;
  sortPinnedFirst: (list: Thesis[]) => Thesis[];
  isManuallyStarred: (thesisId: string) => boolean;
  isEffectivelyStarred: (thesisId: string) => boolean;
  toggleStar: (thesisId: string) => void;
  starDisabledReason: (thesisId: string) => string | null;
  /** Session-only: mark thesis resolved or invalidated (or clear). Fires alerts when starred / open book. */
  setManualThesisOutcome: (thesisId: string, status: "resolved" | "invalidated" | null, thesisTitle: string) => void;
  /** Re-read positions from session storage (call after opening/closing a book position). */
  syncOpenIdsFromBook: () => void;
  tickerItems: LiveSignalTickerItem[];
  alerts: ThesisAlertEntry[];
  /** Active (not dismissed) alerts — drives the nav badge. */
  unreadAlertCount: number;
  dismissAlert: (id: string) => void;
  /** Marks every alert as read (explicit acknowledge-all). */
  markAllRead: () => void;
  /** Marks every alert as read (called when opening bell). */
  markReadOnOpen: () => void;
  pulseKey: (thesisId: string) => number;
  outToast: Toast;
  dismissToast: () => void;
  /** Show a transient toast message (6s). */
  pushToast: (message: string) => void;
  /** Per-thesis notification preference (reduce noise). */
  getNotifyPref: (thesisId: string) => NotifyPref;
  setNotifyPref: (thesisId: string, pref: NotifyPref) => void;

  /** Insider Flow Detector anomalies (newest-first). */
  insiderFlowAnomalies: InsiderFlowAnomaly[];
  /** Insider Flow scenario probability overrides (applied/suggested). */
  insiderFlowScenarioOverride: (thesisId: string) => { base: number; bull: number; bear: number } | null;
  insiderFlowScenarioSuggestion: (thesisId: string) => { base: number; bull: number; bear: number } | null;
  applyInsiderFlowSuggestion: (thesisId: string) => void;
  dismissInsiderFlowSuggestion: (thesisId: string) => void;

  /** Recent thesis evidence rows from Supabase (news / server updates). */
  evidenceLog: ThesisEvidenceLogRow[];

  /** Starred ∪ open-book thesis count — Insider Flow polls anomalies for these IDs only. */
  insiderFlowWatchedCount: number;
};

const ThesisLiveContext = createContext<Ctx | null>(null);

export function useThesisLive(): Ctx {
  const v = useContext(ThesisLiveContext);
  if (!v) throw new Error("ThesisLiveProvider missing");
  return v;
}

export function useThesisLiveOptional(): Ctx | null {
  return useContext(ThesisLiveContext);
}

export function ThesisLiveProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  /** Mock ticker ticks only on thesis routes; DB evidence + Insider Flow poll app-wide (v2 layout). */
  const thesisPageActive = pathname === "/theses" || pathname.startsWith("/theses/");
  const { plan } = useV2Plan();
  const mockTicksEnabled = process.env.NEXT_PUBLIC_THESIS_MOCK_TICKS === "1";

  // Avoid hydration mismatches: read sessionStorage only after mount.
  const [starred, setStarred] = useState<Set<string>>(() => new Set());
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [overrides, setOverrides] = useState<Overrides>({});
  const [tickerItems, setTickerItems] = useState<LiveSignalTickerItem[]>(() => [...MOCK_LIVE_SIGNAL_TICKER]);
  const [alerts, setAlerts] = useState<ThesisAlertEntry[]>([]);
  const [pulseMap, setPulseMap] = useState<Record<string, number>>({});
  const [outToast, setOutToast] = useState<Toast>(null);
  const [outcomeEpoch, setOutcomeEpoch] = useState(0);
  const [prefs, setPrefs] = useState<Record<string, NotifyPref>>({});
  const [, setUserTheses] = useState<Thesis[]>([]);
  const [insiderFlowAnomalies, setInsiderFlowAnomalies] = useState<InsiderFlowAnomaly[]>([]);
  const [insiderApplied, setInsiderApplied] = useState<Record<string, { base: number; bull: number; bear: number }>>({});
  const [insiderSuggested, setInsiderSuggested] = useState<Record<string, { base: number; bull: number; bear: number }>>({});
  const [evidenceLog, setEvidenceLog] = useState<ThesisEvidenceLogRow[]>([]);

  const scenarioRef = useRef(
    new Map<string, { base: number; bull: number; bear: number; lead: "base" | "bull" | "bear" }>(),
  );

  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const starredRef = useRef(starred);
  starredRef.current = starred;
  const openIdsRef = useRef(openIds);
  openIdsRef.current = openIds;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const evidenceBootRef = useRef(false);
  const evidenceHighWaterRef = useRef(0);

  const starredKey = useMemo(() => Array.from(starred).sort().join(","), [starred]);
  const openIdsKey = useMemo(() => Array.from(openIds).sort().join(","), [openIds]);
  const insiderFlowWatchedCount = useMemo(() => {
    const u = new Set<string>();
    starred.forEach((id) => u.add(id));
    openIds.forEach((id) => u.add(id));
    return u.size;
  }, [starred, openIds]);

  const mergeThesisCb = useCallback(
    (t: Thesis) => applyManualOutcome(mergeThesis(t, overrides[t.id])),
    [overrides],
  );

  useEffect(() => {
    setStarred(loadStarred());
    setOpenIds(openPositionThesisIds());
    setPrefs(loadPrefs());
    setUserTheses(loadUserTheses());
  }, []);

  const insiderFlowScenarioOverride = useCallback(
    (thesisId: string) => insiderApplied[thesisId] ?? null,
    [insiderApplied],
  );
  const insiderFlowScenarioSuggestion = useCallback(
    (thesisId: string) => insiderSuggested[thesisId] ?? null,
    [insiderSuggested],
  );
  const applyInsiderFlowSuggestion = useCallback((thesisId: string) => {
    setInsiderSuggested((cur) => {
      const s = cur[thesisId];
      if (!s) return cur;
      setInsiderApplied((a) => ({ ...a, [thesisId]: s }));
      const next = { ...cur };
      delete next[thesisId];
      return next;
    });
  }, []);
  const dismissInsiderFlowSuggestion = useCallback((thesisId: string) => {
    setInsiderSuggested((cur) => {
      if (!cur[thesisId]) return cur;
      const next = { ...cur };
      delete next[thesisId];
      return next;
    });
  }, []);

  const pushAlert = useCallback((a: Omit<ThesisAlertEntry, "id" | "createdAt" | "read">) => {
    const entry: ThesisAlertEntry = {
      ...a,
      id: newAlertId(),
      createdAt: Date.now(),
      read: false,
    };
    setAlerts((cur) => [entry, ...cur].slice(0, MAX_ALERTS));
  }, []);

  const pushToast = useCallback((message: string) => {
    const tid = newAlertId();
    setOutToast({ id: tid, message });
    window.setTimeout(() => {
      setOutToast((cur) => (cur?.id === tid ? null : cur));
    }, 6200);
  }, []);

  useEffect(() => {
    evidenceBootRef.current = false;
  }, [starredKey]);

  useEffect(() => {
    const sb = createSbClient();
    let cancelled = false;

    const parseProb = (p: unknown): { base: number; bull: number; bear: number } | null => {
      if (!p || typeof p !== "object") return null;
      const o = p as Record<string, unknown>;
      const b = o.base;
      const bu = o.bull;
      const be = o.bear;
      if (typeof b === "number" && typeof bu === "number" && typeof be === "number") return { base: b, bull: bu, bear: be };
      return null;
    };

    const tick = async () => {
      const ids = Array.from(
        (() => {
          const u = new Set<string>();
          starredRef.current.forEach((id) => u.add(id));
          openIdsRef.current.forEach((id) => u.add(id));
          return u;
        })(),
      );
      if (!ids.length) {
        if (!cancelled) setEvidenceLog([]);
        return;
      }

      const { data } = await sb
        .from("thesis_evidence_log")
        .select("id,created_at,thesis_id,event_type,description,probability_before,probability_after,metadata")
        .in("thesis_id", ids)
        .order("created_at", { ascending: false })
        .limit(80);

      if (cancelled) return;

      const rows: ThesisEvidenceLogRow[] =
        (data ?? []).map((r: { [k: string]: unknown }) => ({
          id: String(r.id),
          createdAt: Date.parse(String(r.created_at)) || Date.now(),
          thesisId: String(r.thesis_id),
          eventType: String(r.event_type || ""),
          description: String(r.description || ""),
          probabilityBefore: parseProb(r.probability_before),
          probabilityAfter: parseProb(r.probability_after),
          metadata: r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : undefined,
        })) ?? [];

      setEvidenceLog(rows);

      if (!evidenceBootRef.current) {
        evidenceBootRef.current = true;
        evidenceHighWaterRef.current = rows.reduce((m, r) => Math.max(m, r.createdAt), Date.now());
        return;
      }

      const hw = evidenceHighWaterRef.current;
      const fresh = rows.filter((r) => r.createdAt > hw).sort((a, b) => a.createdAt - b.createdAt);

      for (const r of fresh) {
        if (!starredRef.current.has(r.thesisId) && !openIdsRef.current.has(r.thesisId)) continue;
        const pref = prefsRef.current[r.thesisId] ?? "major";
        if (pref === "mute") continue;

        const title = resolveThesisTitle(r.thesisId);
        const signalLevel = typeof r.metadata?.signal_level === "number" ? r.metadata.signal_level : 0;

        if (r.probabilityAfter) {
          const bt = baseThesisForId(r.thesisId);
          if (bt) {
            setOverrides((o) => ({
              ...o,
              [r.thesisId]: { ...(o[r.thesisId] ?? {}), ...scenarioProbPatchFromDb(bt, r.probabilityAfter!) },
            }));
          }
        }

        const insiderEvt =
          r.eventType === "insider_flow" ||
          r.eventType === "insider_flow_confirmed" ||
          r.eventType === "insider_flow_invalidated";

        if (insiderEvt) {
          let notify = pref === "any" || pref === "major";
          if (pref === "consequence") notify = r.eventType === "insider_flow_invalidated";
          if (notify) {
            const kind =
              r.eventType === "insider_flow"
                ? "Unusual flow detected"
                : r.eventType === "insider_flow_confirmed"
                  ? "Flow confirmed by headline"
                  : "Flow invalidated";
            pushAlert({
              thesisId: r.thesisId,
              thesisTitle: title,
              type: "system",
              confirmText: `${kind} — ${r.description || "Insider Flow update"}`,
              consequenceText: "Check the thesis or Insider Flow radar for tape + tags. Pro: enable web push in the radar panel for alerts when this tab is closed.",
              impact:
                r.eventType === "insider_flow_invalidated"
                  ? "major_negative"
                  : r.eventType === "insider_flow_confirmed"
                    ? "major_positive"
                    : "neutral",
            });
            pushToast(`${title}: ${kind}`);
          }
          continue;
        }

        if (r.probabilityBefore && r.probabilityAfter) {
          const before = r.probabilityBefore;
          const after = r.probabilityAfter;
          const deltas: Array<{ k: "base" | "bull" | "bear"; d: number }> = (["base", "bull", "bear"] as const).map((k) => ({
            k,
            d: after[k] - before[k],
          }));
          deltas.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
          const top = deltas[0]!;
          const oldLead = leadScenarioOf(before);
          const newLead = leadScenarioOf(after);
          const leadChanged = oldLead !== newLead;
          const bigMove = Math.abs(top.d) >= 5;
          const scenarioLabel = leadChanged ? newLead : top.k;
          const oldP = before[scenarioLabel];
          const newP = after[scenarioLabel];

          const should =
            pref === "any"
              ? Math.abs(top.d) >= 2 || leadChanged
              : pref === "consequence"
                ? leadChanged && newLead === "bear"
                : bigMove || leadChanged;

          if (!should) continue;

          const consequenceText =
            scenarioLabel === "bull"
              ? "Accelerated path to targets"
              : scenarioLabel === "bear"
                ? "Exit / reduce per advisory"
                : "Base trade plan remains operative";

          pushAlert({
            thesisId: r.thesisId,
            thesisTitle: title,
            type: "probability_change",
            scenario: scenarioLabel,
            oldProbability: oldP,
            newProbability: newP,
            confirmText: `${scenarioLabel === "bull" ? "Bull" : scenarioLabel === "bear" ? "Bear" : "Base"} case ${oldP}% → ${newP}%`,
            consequenceText: `Consequence: ${consequenceText}.`,
            impact: scenarioLabel === "bear" ? "major_negative" : scenarioLabel === "bull" ? "major_positive" : "neutral",
          });

          if (bigMove || (leadChanged && scenarioLabel !== "base")) {
            pushToast(`${title}: ${scenarioLabel} ${oldP}% → ${newP}%`);
          }
        } else {
          const should = pref === "any" || (pref === "major" && signalLevel >= 4);
          if (!should) continue;

          pushAlert({
            thesisId: r.thesisId,
            thesisTitle: title,
            type: "system",
            confirmText: r.description || "Evidence update",
            consequenceText: r.eventType ? `Type: ${r.eventType}` : "",
            impact: "neutral",
          });
        }
      }

      evidenceHighWaterRef.current = Math.max(hw, ...rows.map((r) => r.createdAt));
    };

    void tick();
    const t = window.setInterval(() => void tick(), LIVE_EVIDENCE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [pushAlert, pushToast, starredKey, openIdsKey]);

  useEffect(() => {
    // Read flow_anomalies for followed theses only (starred ∪ open book) — matches server cron scan scope.
    const sb = createSbClient();

    let cancelled = false;
    const tick = async () => {
      const watchIds = Array.from(
        (() => {
          const u = new Set<string>();
          starredRef.current.forEach((id) => u.add(id));
          openIdsRef.current.forEach((id) => u.add(id));
          return u;
        })(),
      );
      if (!watchIds.length) {
        if (!cancelled) setInsiderFlowAnomalies([]);
        return;
      }

      const { data } = await sb
        .from("flow_anomalies")
        .select(
          "id,created_at,thesis_id,thesis_title,pattern_type,status,instruments_moved,matched_tags,confirmed_headline_at,invalidated_at,notes,probability_suggestion,status_reason",
        )
        .in("thesis_id", watchIds)
        .order("created_at", { ascending: false })
        .limit(60);

      if (cancelled) return;
      const isPattern = (x: unknown): x is InsiderFlowPatternType => x === "BULL_LEAK" || x === "BEAR_LEAK";
      const isStatus = (x: unknown): x is InsiderFlowStatus =>
        x === "UNCONFIRMED_LEAK" || x === "CONFIRMED_MOVE" || x === "INVALIDATED";
      const parsed: InsiderFlowAnomaly[] =
        (data ?? []).map((r: { [k: string]: unknown }) => ({
          id: String(r.id),
          createdAt: Date.parse(String(r.created_at)) || Date.now(),
          thesisId: String(r.thesis_id),
          thesisTitle: String(r.thesis_title),
          patternType: isPattern(r.pattern_type) ? r.pattern_type : "BULL_LEAK",
          status: isStatus(r.status) ? r.status : "UNCONFIRMED_LEAK",
          instrumentsMoved: Array.isArray(r.instruments_moved) ? r.instruments_moved : [],
          matchedTags: Array.isArray(r.matched_tags) ? r.matched_tags : [],
          confirmedHeadlineAt: r.confirmed_headline_at ? Date.parse(String(r.confirmed_headline_at)) : undefined,
          invalidatedAt: r.invalidated_at ? Date.parse(String(r.invalidated_at)) : undefined,
          statusReason: typeof r.status_reason === "string" ? r.status_reason : undefined,
          notes: typeof r.notes === "string" ? r.notes : undefined,
        })) ?? [];

      setInsiderFlowAnomalies(parsed);

      if (plan !== "free" && data?.length) {
        for (const raw of data as Array<{ thesis_id?: unknown; probability_suggestion?: unknown }>) {
          const tid = raw.thesis_id ? String(raw.thesis_id) : "";
          const ps = raw.probability_suggestion as { base?: unknown; bull?: unknown; bear?: unknown } | undefined;
          if (!tid || !ps || typeof ps.base !== "number" || typeof ps.bull !== "number" || typeof ps.bear !== "number") continue;
          const s = { base: ps.base, bull: ps.bull, bear: ps.bear };
          if (plan === "pro") setInsiderApplied((cur) => ({ ...cur, [tid]: s }));
          else if (plan === "analyst") setInsiderSuggested((cur) => ({ ...cur, [tid]: s }));
        }
      }
    };

    void tick();
    const t = window.setInterval(() => void tick(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [plan, starredKey, openIdsKey]);

  useEffect(() => {
    const on = () => setOutcomeEpoch((e) => e + 1);
    window.addEventListener(DEPTH4_THESIS_OUTCOMES_CHANGED, on);
    return () => window.removeEventListener(DEPTH4_THESIS_OUTCOMES_CHANGED, on);
  }, []);

  const isManuallyStarred = useCallback((thesisId: string) => starred.has(thesisId), [starred]);

  const isEffectivelyStarred = useCallback(
    (thesisId: string) => starred.has(thesisId) || openIds.has(thesisId),
    [starred, openIds],
  );

  const starDisabledReason = useCallback(
    (thesisId: string) => (openIds.has(thesisId) ? "Open position — alerts stay on. Unstar is disabled while the book is open." : null),
    [openIds],
  );

  const toggleStar = useCallback((thesisId: string) => {
    if (openIds.has(thesisId)) return;
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(thesisId)) next.delete(thesisId);
      else next.add(thesisId);
      saveStarred(next);
      return next;
    });

    // Best-effort: persist star to Supabase for server-side cron scanning (only if signed in).
    const sb = createSbClient();
    void sb.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      const willStar = !starredRef.current.has(thesisId);
      if (willStar) {
        void sb.from("thesis_stars").upsert({ user_id: uid, thesis_id: thesisId });
      } else {
        void sb.from("thesis_stars").delete().eq("user_id", uid).eq("thesis_id", thesisId);
      }
    });
  }, [openIds]);

  const sortPinnedFirst = useCallback(
    (list: Thesis[]) => {
      const merged = list.map((t) => applyManualOutcome(mergeThesis(t, overrides[t.id])));
      const pinned = merged.filter((t) => starred.has(t.id) || openIds.has(t.id));
      const rest = merged.filter((t) => !starred.has(t.id) && !openIds.has(t.id));
      return [...sortThesesForDashboard(pinned), ...sortThesesForDashboard(rest)];
    },
    [overrides, starred, openIds],
  );

  const setManualThesisOutcome = useCallback(
    (thesisId: string, status: "resolved" | "invalidated" | null, thesisTitle: string) => {
      if (status !== null) {
        // Marking an outcome is an explicit follow action; ensure the thesis is starred so the bell tray captures it.
        setStarred((prev) => {
          if (prev.has(thesisId)) return prev;
          const next = new Set(prev);
          next.add(thesisId);
          saveStarred(next);
          return next;
        });
      }
      if (status === null) setThesisOutcome(thesisId, null);
      else setThesisOutcome(thesisId, { status, at: new Date().toISOString() });
      setOutcomeEpoch((e) => e + 1);
      setPulseMap((m) => ({ ...m, [thesisId]: (m[thesisId] ?? 0) + 1 }));

      if (status !== null) {
        const human = status === "resolved" ? "Resolved" : "Invalidated";
        const line =
          status === "resolved"
            ? "You marked this thesis resolved — optional context only unless you reopen the idea."
            : "You marked this thesis invalidated — stand down on new risk from this thread until you rebuild the case.";
        pushAlert({
          thesisId,
          thesisTitle,
          type: status === "invalidated" ? "invalidation" : "system",
          confirmText: line,
          consequenceText: "Exit / reduce per advisory.",
          impact: status === "invalidated" ? "invalidated" : "neutral",
        });
        const tid = newAlertId();
        setOutToast({ id: tid, message: `DEPTH4: ${thesisTitle} — ${human} (manual). Review Book in context.` });
        window.setTimeout(() => {
          setOutToast((cur) => (cur?.id === tid ? null : cur));
        }, 6200);
      }
    },
    [pushAlert],
  );

  const dismissAlert = useCallback((id: string) => {
    setAlerts((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const markAllRead = useCallback(() => {
    setAlerts((cur) => cur.map((x) => ({ ...x, read: true })));
  }, []);

  const markReadOnOpen = useCallback(() => {
    setAlerts((cur) => cur.map((x) => (x.read ? x : { ...x, read: true })));
  }, []);

  const syncOpenIdsFromBook = useCallback(() => {
    const ids = openPositionThesisIds();
    setOpenIds(ids);
    // UX: opening a position is an explicit follow action; keep alerts eligible via star state.
    setStarred((prev) => {
      const next = new Set(prev);
      Array.from(ids).forEach((id) => next.add(id));
      saveStarred(next);
      return next;
    });
  }, []);

  const dismissToast = useCallback(() => setOutToast(null), []);

  const unreadAlertCount = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);

  const getNotifyPref = useCallback((thesisId: string): NotifyPref => prefs[thesisId] ?? "major", [prefs]);
  const setNotifyPref = useCallback((thesisId: string, pref: NotifyPref) => {
    setPrefs((cur) => {
      const next = { ...cur, [thesisId]: pref };
      savePrefs(next);
      return next;
    });
  }, []);

  const pulseKey = useCallback(
    (thesisId: string) => pulseMap[thesisId] ?? 0,
    [pulseMap],
  );

  useEffect(() => {
    const t = window.setInterval(() => setOpenIds(openPositionThesisIds()), 4000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!thesisPageActive || !mockTicksEnabled) return;
    const stream = createMockThesisStream();
    return stream.subscribe((ev) => {
      if (ev.kind !== "mock_tick") return;
      setOpenIds(openPositionThesisIds());
      const tick = runMockThesisTick({
        mockTheses: MOCK_THESES,
        overrides: overridesRef.current,
        hasManualOutcome: (id) => !!getThesisOutcome(id),
        isSubscribed: (id) => starredRef.current.has(id),
        random: Math.random,
      });
      if (!tick) return;

      // Scenario probability notifications (meaningful shifts only).
      if (tick.scenario) {
        // Starred-only rule: never generate notifications for unstarred theses.
        if (!starredRef.current.has(tick.thesisId)) {
          scenarioRef.current.set(tick.thesisId, tick.scenario);
          return;
        }
        const prevS = scenarioRef.current.get(tick.thesisId);
        scenarioRef.current.set(tick.thesisId, tick.scenario);
        if (prevS) {
          const pref = prefs[tick.thesisId] ?? "major";
          if (pref !== "mute") {
            const deltas: Array<{ k: "base" | "bull" | "bear"; d: number }> = (["base", "bull", "bear"] as const).map((k) => ({
              k,
              d: tick.scenario![k] - prevS[k],
            }));
            deltas.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
            const top = deltas[0]!;
            const leadChanged = prevS.lead !== tick.scenario.lead;
            const bigMove = Math.abs(top.d) >= 5;

            const should =
              pref === "any"
                ? Math.abs(top.d) >= 2 || leadChanged
                : pref === "consequence"
                  ? leadChanged && tick.scenario.lead === "bear"
                  : bigMove || leadChanged;

            if (should) {
              const scenarioLabel = leadChanged ? tick.scenario.lead : top.k;
              const oldP = prevS[scenarioLabel];
              const newP = tick.scenario[scenarioLabel];
              const consequenceText =
                scenarioLabel === "bull"
                  ? "Accelerated path to targets"
                  : scenarioLabel === "bear"
                    ? "Exit / reduce per advisory"
                    : "Base trade plan remains operative";

              const thesisTitle = mergeThesisCb(MOCK_THESES.find((t) => t.id === tick.thesisId)!).title;
              pushAlert({
                thesisId: tick.thesisId,
                thesisTitle,
                type: "probability_change",
                scenario: scenarioLabel,
                oldProbability: oldP,
                newProbability: newP,
                confirmText: `${scenarioLabel === "bull" ? "Bull" : scenarioLabel === "bear" ? "Bear" : "Base"} case ${oldP}% → ${newP}%`,
                consequenceText: `Consequence: ${consequenceText}.`,
                impact:
                  scenarioLabel === "bear" ? "major_negative" : scenarioLabel === "bull" ? "major_positive" : "neutral",
              });

              if (bigMove || (leadChanged && scenarioLabel !== "base")) {
                pushToast(`${thesisTitle}: ${scenarioLabel} ${oldP}% → ${newP}%`);
              }
            }
          }
        }
      }

      setOverrides((o) => ({
        ...o,
        [tick.thesisId]: { ...(o[tick.thesisId] ?? {}), ...tick.patch },
      }));
      setPulseMap((m) => ({ ...m, [tick.pulseThesisId]: (m[tick.pulseThesisId] ?? 0) + 1 }));

      if (tick.alert) {
        pushAlert({
          thesisId: tick.alert.thesisId,
          thesisTitle: tick.alert.thesisTitle,
          type: tick.alert.impact === "invalidated" ? "invalidation" : "system",
          confirmText: tick.alert.body.split("\n")[1] ?? "Update received.",
          consequenceText: tick.alert.body.split("\n").slice(-1)[0] ?? "",
          impact: tick.alert.impact,
        });
      }

      if (tick.toastMessage) {
        const tid = newAlertId();
        setOutToast({ id: tid, message: tick.toastMessage });
        window.setTimeout(() => {
          setOutToast((cur) => (cur?.id === tid ? null : cur));
        }, 6200);
      }

      if (tick.tickerItem) {
        setTickerItems((cur) => [tick.tickerItem!, ...cur].slice(0, MAX_TICKER));
      }
    });
  }, [mockTicksEnabled, thesisPageActive, pushAlert, mergeThesisCb, prefs, pushToast]);

  const value = useMemo<Ctx>(() => {
    void outcomeEpoch;
    return {
      mergeThesis: mergeThesisCb,
      sortPinnedFirst,
      isManuallyStarred,
      isEffectivelyStarred,
      toggleStar,
      starDisabledReason,
      setManualThesisOutcome,
      syncOpenIdsFromBook,
      tickerItems,
      alerts,
      unreadAlertCount,
      dismissAlert,
      markAllRead,
      markReadOnOpen,
      pulseKey,
      outToast,
      dismissToast,
      pushToast,
      getNotifyPref,
      setNotifyPref,
      insiderFlowAnomalies,
      insiderFlowScenarioOverride,
      insiderFlowScenarioSuggestion,
      applyInsiderFlowSuggestion,
      dismissInsiderFlowSuggestion,
      evidenceLog,
      insiderFlowWatchedCount,
    };
  },
    [
      mergeThesisCb,
      sortPinnedFirst,
      isManuallyStarred,
      isEffectivelyStarred,
      toggleStar,
      starDisabledReason,
      setManualThesisOutcome,
      syncOpenIdsFromBook,
      tickerItems,
      alerts,
      unreadAlertCount,
      dismissAlert,
      markAllRead,
      markReadOnOpen,
      pulseKey,
      outToast,
      dismissToast,
      pushToast,
      getNotifyPref,
      setNotifyPref,
      insiderFlowAnomalies,
      insiderFlowScenarioOverride,
      insiderFlowScenarioSuggestion,
      applyInsiderFlowSuggestion,
      dismissInsiderFlowSuggestion,
      evidenceLog,
      insiderFlowWatchedCount,
      outcomeEpoch,
    ],
  );

  return <ThesisLiveContext.Provider value={value}>{children}</ThesisLiveContext.Provider>;
}
