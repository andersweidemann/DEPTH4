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
import { buildMockMarketSnapshot } from "@/lib/thesis-engine-v2/insider-flow/mock-market";
import { detectInsiderFlowAnomaly } from "@/lib/thesis-engine-v2/insider-flow/detect";
import type { InsiderFlowAnomaly } from "@/lib/thesis-engine-v2/insider-flow/types";
import { useV2Plan } from "@/lib/thesis-engine-v2/use-plan";

const STAR_KEY = "depth4.v2.starred.v1";
const MAX_TICKER = 14;
const MAX_ALERTS = 20;
const PREF_KEY = "depth4.v2.notify.prefs.v1";

type NotifyPref = "any" | "major" | "consequence" | "mute";

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
  const simActive = pathname === "/theses" || pathname.startsWith("/theses/");
  const { plan } = useV2Plan();

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
  const [userTheses, setUserTheses] = useState<Thesis[]>([]);
  const [insiderFlowAnomalies, setInsiderFlowAnomalies] = useState<InsiderFlowAnomaly[]>([]);
  const [insiderApplied, setInsiderApplied] = useState<Record<string, { base: number; bull: number; bear: number }>>({});
  const [insiderSuggested, setInsiderSuggested] = useState<Record<string, { base: number; bull: number; bear: number }>>({});

  const scenarioRef = useRef(
    new Map<string, { base: number; bull: number; bear: number; lead: "base" | "bull" | "bear" }>(),
  );
  const insiderNotifiedRef = useRef(new Map<string, string>());

  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const starredRef = useRef(starred);
  starredRef.current = starred;
  const openIdsRef = useRef(openIds);
  openIdsRef.current = openIds;

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
    // Insider Flow Detector (MVP): run a deterministic scan every 5 minutes while the live demo pages are active.
    if (!simActive) return;
    const run = () => {
      const nowMs = Date.now();
      const theses = [...MOCK_THESES.map(mergeThesisCb), ...userTheses];
      const monitored = theses.filter((t) => {
        const cfg = t.insiderFlow;
        if (!cfg) return false;
        const nInstr = (cfg.bullInstruments?.length ?? 0) + (cfg.bearInstruments?.length ?? 0);
        const nTags = cfg.confirmTags?.length ?? 0;
        return nInstr > 0 && nTags > 0;
      });
      if (!monitored.length) return;

      const symbols = Array.from(
        new Set(
          monitored.flatMap((t) => [
            ...(t.insiderFlow?.bullInstruments ?? []),
            ...(t.insiderFlow?.bearInstruments ?? []),
          ]),
        ),
      );
      const market = buildMockMarketSnapshot(nowMs, symbols);

      // Use the mock theses as a stand-in for recent headlines (future: feed items / stories).
      const recentHeadlines = MOCK_THESES.slice(0, 12).map((t) => ({ headline: t.title, atMs: nowMs - 6 * 60_000 }));

      const found: InsiderFlowAnomaly[] = [];
      for (const t of monitored) {
        const cfg = t.insiderFlow!;
        const a = detectInsiderFlowAnomaly({
          nowMs,
          thesisId: t.id,
          thesisTitle: t.title,
          bullInstruments: cfg.bullInstruments ?? [],
          bearInstruments: cfg.bearInstruments ?? [],
          confirmTags: cfg.confirmTags ?? [],
          recentHeadlines,
          market,
        });
        if (a) found.push(a);
      }

      if (found.length) {
        setInsiderFlowAnomalies((cur) => [...found, ...cur].slice(0, 120));

        // Scenario probability suggestion/auto-apply (MVP).
        // Base numbers: if thesis has explicit scenarioOverrides use those; otherwise use a 40/35/25 prior.
        for (const a of found) {
          const t = monitored.find((x) => x.id === a.thesisId);
          const prior = t?.scenarioOverrides
            ? { base: t.scenarioOverrides.base.probability, bull: t.scenarioOverrides.bull.probability, bear: t.scenarioOverrides.bear.probability }
            : { base: 40, bull: 35, bear: 25 };

          const zMax = a.instrumentsMoved.reduce((m, x) => Math.max(m, Math.abs(x.z_score)), 0);
          const volMax = a.instrumentsMoved.reduce((m, x) => Math.max(m, x.volume_multiple), 0);
          const aligned = a.instrumentsMoved.length;

          let bump = 7;
          if (zMax >= 2 || volMax >= 5) bump = 15;
          if (aligned >= 3) bump = 20;

          const next = { ...prior };
          if (a.patternType === "BULL_LEAK") {
            next.bull = prior.bull + bump;
            next.bear = prior.bear - Math.round(bump * 0.7);
          } else {
            next.bear = prior.bear + bump;
            next.bull = prior.bull - Math.round(bump * 0.7);
          }
          next.base = 100 - next.bull - next.bear;
          // Clamp and renormalize lightly.
          next.bull = Math.max(5, Math.min(90, next.bull));
          next.bear = Math.max(5, Math.min(90, next.bear));
          next.base = Math.max(5, Math.min(90, next.base));
          const sum = next.base + next.bull + next.bear;
          if (sum !== 100) {
            // distribute diff to base to preserve bias
            next.base = Math.max(5, Math.min(90, next.base + (100 - sum)));
          }

          if (plan === "pro") {
            setInsiderApplied((cur) => ({ ...cur, [a.thesisId]: next }));
          } else if (plan === "analyst") {
            setInsiderSuggested((cur) => ({ ...cur, [a.thesisId]: next }));
          }

          // Starred-only bell notification (respects per-thesis alert prefs).
          if (starredRef.current.has(a.thesisId)) {
            const last = insiderNotifiedRef.current.get(a.thesisId);
            if (last !== a.id) {
              insiderNotifiedRef.current.set(a.thesisId, a.id);
              const pref = prefs[a.thesisId] ?? "major";
              if (pref !== "mute") {
                const scenarioLabel = a.patternType === "BULL_LEAK" ? ("bull" as const) : ("bear" as const);
                const oldP = prior[scenarioLabel];
                const newP = next[scenarioLabel];
                const delta = Math.abs(newP - oldP);
                const oldLead = (["base", "bull", "bear"] as const).reduce((best, k) => (prior[k] > prior[best] ? k : best), "base");
                const newLead = (["base", "bull", "bear"] as const).reduce((best, k) => (next[k] > next[best] ? k : best), "base");
                const leadChanged = oldLead !== newLead;

                const shouldNotify =
                  pref === "any"
                    ? delta >= 2 || leadChanged
                    : pref === "consequence"
                      ? a.patternType === "BEAR_LEAK" && (delta >= 5 || leadChanged)
                      : delta >= 10 || leadChanged;

                if (shouldNotify) {
                  pushAlert({
                    thesisId: a.thesisId,
                    thesisTitle: a.thesisTitle,
                    type: "probability_change",
                    scenario: scenarioLabel,
                    oldProbability: oldP,
                    newProbability: newP,
                    confirmText: `Insider flow: ${a.patternType === "BULL_LEAK" ? "Bull leak" : "Bear leak"} · ${oldP}% → ${newP}%`,
                    consequenceText:
                      a.status === "UNCONFIRMED_LEAK"
                        ? "No matching public headline yet."
                        : a.status === "CONFIRMED_MOVE"
                          ? "Matched confirm tags in public feed."
                          : "Prior leak signal invalidated.",
                    impact: a.patternType === "BULL_LEAK" ? "major_positive" : "major_negative",
                  });

                  if (plan === "pro" && (delta >= 10 || leadChanged)) {
                    pushToast(`${a.thesisTitle}: insider flow ${oldP}% → ${newP}%`);
                  }
                }
              }
            }
          }
        }
      }
    };

    // Run once on enter, then every 5 minutes.
    run();
    const t = window.setInterval(run, 300_000);
    return () => window.clearInterval(t);
  }, [mergeThesisCb, plan, prefs, pushAlert, pushToast, simActive, userTheses]);

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
      for (const id of ids) next.add(id);
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
    if (!simActive) return;
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
  }, [simActive, pushAlert, mergeThesisCb, prefs, pushToast]);

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
      outcomeEpoch,
    ],
  );

  return <ThesisLiveContext.Provider value={value}>{children}</ThesisLiveContext.Provider>;
}
