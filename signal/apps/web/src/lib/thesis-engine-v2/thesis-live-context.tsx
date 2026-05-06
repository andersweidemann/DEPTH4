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
import type { AdvisoryAction, LiveSignalTickerItem, Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";
import { MOCK_LIVE_SIGNAL_TICKER, MOCK_THESES, sortThesesForDashboard } from "@/lib/thesis-engine-v2/mock-data";
import { loadPositions } from "@/lib/thesis-engine-v2/positions-store";

const STAR_KEY = "depth4.v2.starred.v1";
const TICK_MS = 11_000;
const MAX_TICKER = 14;
const MAX_ALERTS = 20;

export type ThesisAlertImpact =
  | "major_positive"
  | "minor_positive"
  | "neutral"
  | "minor_negative"
  | "major_negative"
  | "invalidated";

export type ThesisAlertEntry = {
  id: string;
  createdAt: number;
  thesisId: string;
  thesisTitle: string;
  body: string;
  impact: ThesisAlertImpact;
};

type Overrides = Record<string, Partial<Thesis>>;

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
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

function scoreTotalFromParts(s: Thesis["scores"]): number {
  return clamp(
    s.driverStrength + s.timeCompression + s.marketMispricingScore + s.tradeClarityScore + s.triggerClarityScore,
    0,
    100,
  );
}

function qualificationFromTotal(total: number): Thesis["qualification"] {
  if (total >= 65) return "tradeable";
  if (total >= 40) return "emerging";
  return "theme";
}

function mergeThesis(base: Thesis, patch: Partial<Thesis> | undefined): Thesis {
  if (!patch || Object.keys(patch).length === 0) return base;
  if (patch.scores) {
    const sp = { ...base.scores, ...patch.scores };
    const total = scoreTotalFromParts(sp);
    const scores = { ...sp, total };
    return { ...base, ...patch, scores, qualification: qualificationFromTotal(total) };
  }
  return { ...base, ...patch, scores: base.scores, qualification: base.qualification };
}

function stanceLabel(a: AdvisoryAction): string {
  switch (a) {
    case "enter":
      return "Entry possible — use your plan and risk limits.";
    case "hold":
      return "Hold — thesis intact; manage risk.";
    case "reduce":
      return "Reduce — take risk down until the picture clears.";
    case "exit":
      return "Exit — thesis closed or invalidation hit.";
    default:
      return "Watch — wait for a cleaner trigger before sizing up.";
  }
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
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

  const [starred, setStarred] = useState<Set<string>>(() => loadStarred());
  const [openIds, setOpenIds] = useState<Set<string>>(() => openPositionThesisIds());
  const [overrides, setOverrides] = useState<Overrides>({});
  const [tickerItems, setTickerItems] = useState<LiveSignalTickerItem[]>(() => [...MOCK_LIVE_SIGNAL_TICKER]);
  const [alerts, setAlerts] = useState<ThesisAlertEntry[]>([]);
  const [pulseMap, setPulseMap] = useState<Record<string, number>>({});
  const [outToast, setOutToast] = useState<Toast>(null);

  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const starredRef = useRef(starred);
  starredRef.current = starred;
  const openIdsRef = useRef(openIds);
  openIdsRef.current = openIds;

  useEffect(() => {
    setStarred(loadStarred());
  }, []);

  const mergeThesisCb = useCallback((t: Thesis) => mergeThesis(t, overrides[t.id]), [overrides]);

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
      const merged = list.map((t) => mergeThesis(t, overrides[t.id]));
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
    const tick = () => {
      setOpenIds(openPositionThesisIds());
      const pool = MOCK_THESES;
      if (!pool.length) return;

      const base = randomPick(pool);
      const prev = mergeThesis(base, overridesRef.current[base.id]);
      const roll = Math.random();
      let patch: Partial<Thesis> = {};
      let majorSignal = false;
      let statusChanged = false;
      let invalidated = false;

      if (roll < 0.04 && prev.status !== "invalidated" && prev.status !== "resolved") {
        invalidated = true;
        patch = { status: "invalidated" as ThesisStatus, probability: clamp(prev.probability - 8, 15, 85) };
        statusChanged = true;
      } else if (roll < 0.1 && prev.status === "watching" && prev.probability >= 48) {
        patch = { status: "ready" as ThesisStatus, probability: clamp(prev.probability + 4, 45, 88) };
        statusChanged = true;
      } else if (roll < 0.24) {
        const d = Math.floor(Math.random() * 7) + 4;
        const sign = Math.random() < 0.55 ? 1 : -1;
        patch = { probability: clamp(prev.probability + sign * d, 18, 92) };
      } else if (roll < 0.34) {
        const parts = { ...prev.scores };
        const k = randomPick(["driverStrength", "timeCompression", "marketMispricingScore"] as const);
        const bump = Math.random() < 0.5 ? 1 : 2;
        parts[k] = clamp(parts[k] + bump, 0, k === "driverStrength" ? 20 : 25);
        patch = { scores: parts };
      } else {
        const d = Math.floor(Math.random() * 3) + 1;
        const sign = Math.random() < 0.5 ? 1 : -1;
        patch = { probability: clamp(prev.probability + sign * d, 18, 92) };
      }

      if (roll > 0.92 && !invalidated) {
        majorSignal = true;
      }

      const next = mergeThesis(prev, patch);
      const probDelta = next.probability - prev.probability;

      setOverrides((o) => ({
        ...o,
        [base.id]: { ...(o[base.id] ?? {}), ...patch },
      }));
      setPulseMap((m) => ({ ...m, [base.id]: (m[base.id] ?? 0) + 1 }));

      const thesisAwareLine = invalidated
        ? "Invalidation conditions are now in play — treat the thesis as broken until re-tested."
        : majorSignal
          ? "Desk read: flow still matches the thesis; price reaction matters more than the headline."
          : statusChanged && next.status === "ready"
            ? "Trigger window is cleaner — entry setup is now valid enough to act on with a plan."
            : Math.abs(probDelta) >= 5
              ? "Evidence moved enough to change conviction — compare this move to your risk plan."
              : "Routine tape check — thesis unchanged at this confidence level.";

      const impact: ThesisAlertImpact = invalidated
        ? "invalidated"
        : probDelta >= 4
          ? "major_positive"
          : probDelta <= -4
            ? "major_negative"
            : Math.abs(probDelta) >= 2
              ? probDelta > 0
                ? "minor_positive"
                : "minor_negative"
              : "neutral";

      const eff = starredRef.current.has(base.id) || openIdsRef.current.has(base.id);
      const notifyProb = Math.abs(probDelta) >= 5;
      const shouldNotify = eff && (statusChanged || invalidated || notifyProb || majorSignal);

      if (shouldNotify) {
        const body = [
          `${prev.title}`,
          thesisAwareLine,
          `Thesis impact: ${impact === "invalidated" ? "Invalidated" : impact.replace(/_/g, " ")}.`,
          `Probability: ${prev.probability}% → ${next.probability}%.`,
          `Stance: ${stanceLabel(next.advisoryAction)}`,
        ].join("\n");
        pushAlert({
          thesisId: base.id,
          thesisTitle: prev.title,
          body,
          impact,
        });
      }

      if (eff && (notifyProb || invalidated || (statusChanged && next.status === "ready"))) {
        const msg =
          invalidated || (statusChanged && next.status === "ready")
            ? `DEPTH4 Alert: ${prev.title} — ${invalidated ? "Invalidated." : "Now Ready. Entry setup valid."} Probability: ${next.probability}%.`
            : `DEPTH4 Alert: ${prev.title} — Probability moved materially (${prev.probability}% → ${next.probability}%).`;
        const tid = newAlertId();
        setOutToast({ id: tid, message: msg });
        window.setTimeout(() => {
          setOutToast((cur) => (cur?.id === tid ? null : cur));
        }, 6200);
      }

      if (majorSignal && !invalidated) {
        const ti: LiveSignalTickerItem = {
          id: `tick-${Date.now()}`,
          kind: "thesis_update",
          source: "DEPTH4 Desk",
          timestamp: "Live · now",
          headline: `${prev.title}: desk read unchanged — watch follow-through vs. your entry zone.`,
          thesisName: prev.title,
          probabilityBefore: prev.probability,
          probabilityAfter: next.probability,
          impact: probDelta >= 0 ? "major_positive" : "major_negative",
        };
        setTickerItems((cur) => [ti, ...cur].slice(0, MAX_TICKER));
      }
    };

    const idt = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(idt);
  }, [simActive, pushAlert]);

  const value = useMemo<Ctx>(
    () => ({
      mergeThesis: mergeThesisCb,
      sortPinnedFirst,
      isManuallyStarred,
      isEffectivelyStarred,
      toggleStar,
      starDisabledReason,
      syncOpenIdsFromBook,
      tickerItems,
      alerts,
      unreadAlertCount,
      dismissAlert,
      dismissAllAlerts,
      pulseKey,
      outToast,
      dismissToast,
    }),
    [
      mergeThesisCb,
      sortPinnedFirst,
      isManuallyStarred,
      isEffectivelyStarred,
      toggleStar,
      starDisabledReason,
      syncOpenIdsFromBook,
      tickerItems,
      alerts,
      unreadAlertCount,
      dismissAlert,
      dismissAllAlerts,
      pulseKey,
      outToast,
      dismissToast,
    ],
  );

  return <ThesisLiveContext.Provider value={value}>{children}</ThesisLiveContext.Provider>;
}
