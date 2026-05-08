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

  const scenarioRef = useRef(
    new Map<string, { base: number; bull: number; bear: number; lead: "base" | "bull" | "bear" }>(),
  );

  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const starredRef = useRef(starred);
  starredRef.current = starred;
  const openIdsRef = useRef(openIds);
  openIdsRef.current = openIds;

  useEffect(() => {
    setStarred(loadStarred());
    setOpenIds(openPositionThesisIds());
    setPrefs(loadPrefs());
  }, []);

  useEffect(() => {
    const on = () => setOutcomeEpoch((e) => e + 1);
    window.addEventListener(DEPTH4_THESIS_OUTCOMES_CHANGED, on);
    return () => window.removeEventListener(DEPTH4_THESIS_OUTCOMES_CHANGED, on);
  }, []);

  const mergeThesisCb = useCallback(
    (t: Thesis) => applyManualOutcome(mergeThesis(t, overrides[t.id])),
    [overrides],
  );

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

  const pushAlert = useCallback((a: Omit<ThesisAlertEntry, "id" | "createdAt" | "read">) => {
    const entry: ThesisAlertEntry = {
      ...a,
      id: newAlertId(),
      createdAt: Date.now(),
      read: false,
    };
    setAlerts((cur) => [entry, ...cur].slice(0, MAX_ALERTS));
  }, []);

  const setManualThesisOutcome = useCallback(
    (thesisId: string, status: "resolved" | "invalidated" | null, thesisTitle: string) => {
      if (status === null) setThesisOutcome(thesisId, null);
      else setThesisOutcome(thesisId, { status, at: new Date().toISOString() });
      setOutcomeEpoch((e) => e + 1);
      setPulseMap((m) => ({ ...m, [thesisId]: (m[thesisId] ?? 0) + 1 }));

      if (status !== null) {
        const eff = starredRef.current.has(thesisId);
        const human = status === "resolved" ? "Resolved" : "Invalidated";
        const line =
          status === "resolved"
            ? "You marked this thesis resolved — optional context only unless you reopen the idea."
            : "You marked this thesis invalidated — stand down on new risk from this thread until you rebuild the case.";
        if (eff) {
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
    setOpenIds(openPositionThesisIds());
  }, []);

  const dismissToast = useCallback(() => setOutToast(null), []);
  const pushToast = useCallback((message: string) => {
    const tid = newAlertId();
    setOutToast({ id: tid, message });
    window.setTimeout(() => {
      setOutToast((cur) => (cur?.id === tid ? null : cur));
    }, 6200);
  }, []);

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
      outcomeEpoch,
    ],
  );

  return <ThesisLiveContext.Provider value={value}>{children}</ThesisLiveContext.Provider>;
}
