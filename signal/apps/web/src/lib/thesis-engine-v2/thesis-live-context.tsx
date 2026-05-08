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

export type ThesisAlertEntry = {
  id: string;
  createdAt: number;
  thesisId: string;
  thesisTitle: string;
  body: string;
  impact: ThesisAlertImpact;
};

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
  /** Clears every alert from the tray (explicit acknowledge-all). */
  dismissAllAlerts: () => void;
  pulseKey: (thesisId: string) => number;
  outToast: Toast;
  dismissToast: () => void;
  /** Show a transient toast message (6s). */
  pushToast: (message: string) => void;
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

  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const starredRef = useRef(starred);
  starredRef.current = starred;
  const openIdsRef = useRef(openIds);
  openIdsRef.current = openIds;

  useEffect(() => {
    setStarred(loadStarred());
    setOpenIds(openPositionThesisIds());
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

  const pushAlert = useCallback((a: Omit<ThesisAlertEntry, "id" | "createdAt">) => {
    const entry: ThesisAlertEntry = {
      ...a,
      id: newAlertId(),
      createdAt: Date.now(),
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
        const eff = starredRef.current.has(thesisId) || openIdsRef.current.has(thesisId);
        const human = status === "resolved" ? "Resolved" : "Invalidated";
        const line =
          status === "resolved"
            ? "You marked this thesis resolved — optional context only unless you reopen the idea."
            : "You marked this thesis invalidated — stand down on new risk from this thread until you rebuild the case.";
        const body = [
          thesisTitle,
          line,
          `Thesis impact: ${human.toLowerCase()} (manual).`,
          `Check Book for open or closed lines linked to this thesis.`,
          `Stance: Exit / stand down on new risk from this thread.`,
        ].join("\n");
        if (eff) {
          pushAlert({
            thesisId,
            thesisTitle,
            body,
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

  const dismissAllAlerts = useCallback(() => {
    setAlerts([]);
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

  const unreadAlertCount = useMemo(() => alerts.length, [alerts]);

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
        isSubscribed: (id) => starredRef.current.has(id) || openIdsRef.current.has(id),
        random: Math.random,
      });
      if (!tick) return;

      setOverrides((o) => ({
        ...o,
        [tick.thesisId]: { ...(o[tick.thesisId] ?? {}), ...tick.patch },
      }));
      setPulseMap((m) => ({ ...m, [tick.pulseThesisId]: (m[tick.pulseThesisId] ?? 0) + 1 }));

      if (tick.alert) {
        pushAlert(tick.alert);
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
  }, [simActive, pushAlert]);

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
      dismissAllAlerts,
      pulseKey,
      outToast,
      dismissToast,
      pushToast,
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
      dismissAllAlerts,
      pulseKey,
      outToast,
      dismissToast,
      pushToast,
      outcomeEpoch,
    ],
  );

  return <ThesisLiveContext.Provider value={value}>{children}</ThesisLiveContext.Provider>;
}
