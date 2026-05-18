"use client";

import { authFetch } from "@/lib/api";
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
import type { ThesisAlertImpact } from "@/lib/thesis-engine-v2/thesis-alert-types";

export type { ThesisAlertImpact } from "@/lib/thesis-engine-v2/thesis-alert-types";
import { mergeThesis, type ThesisOverrides } from "@/lib/thesis-engine-v2/thesis-merge";
import {
  fetchLatestNonSeedScenarioTripleFromEvidenceLog,
  type CatalogThesisScenarioProbabilities,
} from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { catalogResolvedTriplesLookLikeBulkWriterCollapse } from "@/lib/thesis-engine-v2/catalog-scenario-universal-collapse-guard";
import { CATALOG_THESES, getThesisDetail, sortThesesForDashboard, thesisSlugById } from "@/lib/thesis-engine-v2/catalog-data";
import { loadPositions } from "@/lib/thesis-engine-v2/positions-store";
import type { LiveSignalTickerItem, Thesis } from "@/lib/thesis-engine-v2/types";
import type { ThesisLifecycleState } from "@/types/thesis";
import { parseLifecycleState } from "@/lib/theses/thesis-lifecycle";
import { getThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";
import {
  buildEvidencePollThesisIds,
  collectEligibleUserThesisPollIdSet,
  EVIDENCE_LOG_POLL_ROW_LIMIT,
  isFreshEvidenceAlertEligible,
} from "@/lib/thesis-engine-v2/thesis-evidence-poll-scope";
import { loadUserTheses } from "@/lib/thesis-engine-v2/user-theses";
import type { InsiderFlowAnomaly } from "@/lib/thesis-engine-v2/insider-flow/types";
import type { InsiderFlowPatternType, InsiderFlowStatus } from "@/lib/thesis-engine-v2/insider-flow/types";
import { useV2Plan } from "@/lib/thesis-engine-v2/use-plan";
import { createClient as createSbClient } from "@/lib/supabase/client";
import {
  dbScenarioTripleEqualsSeed,
  defaultScenarioOverridesFromThesis,
  thesisConvictionPctFromDbTriple,
  thesisWithSyncedLiveProbability,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { latestNonSeedScenarioTripleByThesisId } from "@/lib/thesis-engine-v2/thesis-evidence-scenario-bootstrap";
import { isSystemThesisId } from "@/lib/thesis-engine-v2/system-thesis-ids";
import { displayLabelForDbScenarioKey } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";
import { hydrateDepth4AccountState } from "@/lib/thesis-engine-v2/depth4-account-hydration";
import { schedulePersistDepth4AccountPrefsDebounced } from "@/lib/thesis-engine-v2/depth4-account-prefs-persist";
import { persistDepth4AlertStates } from "@/lib/thesis-engine-v2/depth4-alert-state-persist";
import {
  applyDepth4AlertStateMapToAlerts,
  mergeDepth4AlertStateRecords,
  type Depth4AlertPersistedState,
} from "@/lib/thesis-engine-v2/depth4-alert-state-utils";
import {
  buildThesisAlertFromEvidenceRow,
  evidenceLogRowStableAlertId,
} from "@/lib/thesis-engine-v2/thesis-alert-from-evidence";
import { DEPTH4_NOTIFY_PREFS_SESSION_KEY, DEPTH4_STARRED_SESSION_KEY } from "@/lib/thesis-engine-v2/depth4-session-keys";
import { appendDepth4ThesisStarEvent } from "@/lib/thesis-engine-v2/depth4-thesis-star-events";

const MAX_TICKER = 14;
const MAX_ALERTS = 20;
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
    const raw = window.sessionStorage.getItem(DEPTH4_NOTIFY_PREFS_SESSION_KEY);
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
    window.sessionStorage.setItem(DEPTH4_NOTIFY_PREFS_SESSION_KEY, JSON.stringify(next));
    schedulePersistDepth4AccountPrefsDebounced();
  } catch {
    // ignore
  }
}

function loadStarred(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(DEPTH4_STARRED_SESSION_KEY);
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
    window.sessionStorage.setItem(DEPTH4_STARRED_SESSION_KEY, JSON.stringify(Array.from(ids)));
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

function newAlertId(): string {
  return `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function baseThesisForId(thesisId: string): Thesis | undefined {
  const slug = thesisSlugById(thesisId);
  if (slug) {
    const d = getThesisDetail(slug);
    if (d) return d.thesis;
  }
  return loadUserTheses().find((t) => t.id === thesisId);
}

function scenarioProbPatchFromDb(baseThesis: Thesis, p: { base: number; bull: number; bear: number }): Partial<Thesis> {
  const defaults = defaultScenarioOverridesFromThesis(baseThesis);
  const o = baseThesis.scenarioOverrides ?? defaults;
  const scenarioOverrides = {
    base: {
      probability: p.base,
      confirmation: o.base.confirmation.trim() ? o.base.confirmation : defaults.base.confirmation,
      marketConsequence: o.base.marketConsequence.trim() ? o.base.marketConsequence : defaults.base.marketConsequence,
    },
    bull: {
      probability: p.bull,
      confirmation: o.bull.confirmation.trim() ? o.bull.confirmation : defaults.bull.confirmation,
      marketConsequence: o.bull.marketConsequence.trim() ? o.bull.marketConsequence : defaults.bull.marketConsequence,
    },
    bear: {
      probability: p.bear,
      confirmation: o.bear.confirmation.trim() ? o.bear.confirmation : defaults.bear.confirmation,
      marketConsequence: o.bear.marketConsequence.trim() ? o.bear.marketConsequence : defaults.bear.marketConsequence,
    },
  };
  return {
    scenarioOverrides,
    probability: thesisConvictionPctFromDbTriple(p),
  };
}

function leadScenarioOf(p: { base: number; bull: number; bear: number }) {
  return (["base", "bull", "bear"] as const).reduce((best, k) => (p[k] > p[best] ? k : best), "base");
}

function evidenceRowsToTickerItems(rows: ThesisEvidenceLogRow[], titleForThesisId: (id: string) => string): LiveSignalTickerItem[] {
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);
  const out: LiveSignalTickerItem[] = [];
  const tsFmt = (ms: number) =>
    new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  for (const r of sorted) {
    if (out.length >= MAX_TICKER) break;
    const timestamp = tsFmt(r.createdAt);
    const meta = r.metadata ?? {};
    const sourceRaw = meta.source;
    const source = typeof sourceRaw === "string" && sourceRaw.trim() ? sourceRaw : "Evidence";
    const headline = (r.description || "").trim().slice(0, 220) || r.eventType || "Thesis evidence update";

    if (r.probabilityBefore && r.probabilityAfter) {
      const after = r.probabilityAfter;
      const before = r.probabilityBefore;
      const deltas = (["base", "bull", "bear"] as const).map((k) => ({ k, d: after[k] - before[k] }));
      deltas.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
      const top = deltas[0]!;
      const oldLead = leadScenarioOf(before);
      const newLead = leadScenarioOf(after);
      const leadChanged = oldLead !== newLead;
      const scenarioLabel = leadChanged ? newLead : top.k;
      const oldP = before[scenarioLabel];
      const newP = after[scenarioLabel];
      const d = newP - oldP;
      const impact =
        d >= 5 ? "major_positive" : d >= 2 ? "minor_positive" : d <= -5 ? "major_negative" : d <= -2 ? "minor_negative" : "neutral";

      out.push({
        id: `ev-${r.id}`,
        kind: "thesis_update",
        source,
        timestamp,
        headline,
        thesisName: titleForThesisId(r.thesisId),
        probabilityBefore: oldP,
        probabilityAfter: newP,
        impact,
      });
    } else {
      out.push({
        id: `ev-${r.id}`,
        kind: "catalogued",
        source,
        timestamp,
        headline,
        note: r.eventType || "Update",
      });
    }
  }
  return out;
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

  /**
   * Pin a thesis id to the **front** of evidence / flow poll id lists so its `thesis_evidence_log`
   * rows are not starved when the global newest-N query is dominated by other theses.
   * Call with `null` on unmount. Same path for system + user theses.
   */
  registerEvidenceLogPollPriorityThesisId: (thesisId: string | null) => void;

  /** Starred ∪ open-book thesis count — Insider Flow polls anomalies for these IDs only. */
  insiderFlowWatchedCount: number;

  /** `public.theses.title` keyed by thesis id (catalog rows), when signed in. */
  catalogDbThesisTitles: ReadonlyMap<string, string>;
  /** `public.theses.micro_label` keyed by thesis id (catalog rows), when signed in. */
  catalogDbThesisMicroLabels: ReadonlyMap<string, string>;
  /** `public.theses.body` JSON keyed by thesis id (catalog rows), when signed in. */
  catalogDbThesisBodies: ReadonlyMap<string, unknown>;
  /** `public.theses.slug` keyed by thesis id (catalog rows), when signed in. */
  catalogDbThesisSlugs: ReadonlyMap<string, string>;
  /** Parsed `public.theses.scenario_probabilities` for catalog rows (when present). */
  catalogDbThesisScenarioProbabilities: ReadonlyMap<string, CatalogThesisScenarioProbabilities>;
  /** `public.theses.lifecycle_state` for catalog rows (when present). */
  catalogDbThesisLifecycleStates: ReadonlyMap<string, ThesisLifecycleState>;
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
  const { plan } = useV2Plan();

  // Avoid hydration mismatches: read sessionStorage only after mount.
  const [starred, setStarred] = useState<Set<string>>(() => new Set());
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [overrides, setOverrides] = useState<ThesisOverrides>({});
  const [alerts, setAlerts] = useState<ThesisAlertEntry[]>([]);
  const [pulseMap] = useState<Record<string, number>>({});
  const [outToast, setOutToast] = useState<Toast>(null);
  const [prefs, setPrefs] = useState<Record<string, NotifyPref>>({});
  const [, setUserTheses] = useState<Thesis[]>([]);
  const [insiderFlowAnomalies, setInsiderFlowAnomalies] = useState<InsiderFlowAnomaly[]>([]);
  const [insiderApplied, setInsiderApplied] = useState<Record<string, { base: number; bull: number; bear: number }>>({});
  const [insiderSuggested, setInsiderSuggested] = useState<Record<string, { base: number; bull: number; bear: number }>>({});
  const [evidenceLog, setEvidenceLog] = useState<ThesisEvidenceLogRow[]>([]);
  const [catalogDbThesisTitles, setCatalogDbThesisTitles] = useState(() => new Map<string, string>());
  const [catalogDbThesisMicroLabels, setCatalogDbThesisMicroLabels] = useState(() => new Map<string, string>());
  const [catalogDbThesisBodies, setCatalogDbThesisBodies] = useState(() => new Map<string, unknown>());
  const [catalogDbThesisSlugs, setCatalogDbThesisSlugs] = useState(() => new Map<string, string>());
  const [catalogDbThesisScenarioProbabilities, setCatalogDbThesisScenarioProbabilities] = useState(
    () => new Map<string, CatalogThesisScenarioProbabilities>(),
  );
  const [catalogDbThesisLifecycleStates, setCatalogDbThesisLifecycleStates] = useState(
    () => new Map<string, ThesisLifecycleState>(),
  );

  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const starredRef = useRef(starred);
  starredRef.current = starred;
  const openIdsRef = useRef(openIds);
  openIdsRef.current = openIds;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const alertAccountStateRef = useRef<Record<string, Depth4AlertPersistedState>>({});
  const alertsReplayedRef = useRef(false);

  const evidenceBootRef = useRef(false);
  const evidenceHighWaterRef = useRef(0);
  /** Detail drawer / thesis page — polled first; avoids empty Evidence Timeline on busy accounts. */
  const evidencePollPriorityThesisIdRef = useRef<string | null>(null);
  const [evidencePollPriorityNonce, setEvidencePollPriorityNonce] = useState(0);

  const registerEvidenceLogPollPriorityThesisId = useCallback((thesisId: string | null) => {
    const next = thesisId?.trim() || null;
    const prev = evidencePollPriorityThesisIdRef.current;
    if (prev === next) return;
    evidencePollPriorityThesisIdRef.current = next;
    // Bump only on real changes so evidence/insider poll effects are not torn down on every
    // ThesisLiveProvider re-render (was freezing /theses when closing the detail drawer).
    setEvidencePollPriorityNonce((n) => n + 1);
  }, []);

  const starredKey = useMemo(() => Array.from(starred).sort().join(","), [starred]);
  const openIdsKey = useMemo(() => Array.from(openIds).sort().join(","), [openIds]);
  const insiderFlowWatchedCount = useMemo(() => {
    const u = new Set<string>();
    starred.forEach((id) => u.add(id));
    openIds.forEach((id) => u.add(id));
    return u.size;
  }, [starred, openIds]);

  const resolveThesisDisplayTitle = useCallback(
    (thesisId: string) => {
      const db = catalogDbThesisTitles.get(thesisId)?.trim();
      if (db) return getThesisDisplayTitle({ title: db });
      const sys = CATALOG_THESES.find((t) => t.id === thesisId);
      if (sys) return getThesisDisplayTitle(sys);
      const u = loadUserTheses().find((t) => t.id === thesisId);
      if (u) return getThesisDisplayTitle(u);
      return "Thesis";
    },
    [catalogDbThesisTitles],
  );

  useEffect(() => {
    let cancelled = false;
    void authFetch("/api/theses/catalog-titles")
      .then((r) => r.json())
      .then((j: unknown) => {
        if (cancelled) return;
        const root = j && typeof j === "object" ? (j as Record<string, unknown>) : null;
        const o = root?.titlesByThesisId;
        const microObj = root?.microLabelsByThesisId;
        const bodiesObj = root?.bodiesByThesisId;
        const slugsObj = root?.slugsByThesisId;
        const scenObj = root?.scenarioProbabilitiesByThesisId;
        const lifecycleObj = root?.lifecycleStatesByThesisId;
        const m = new Map<string, string>();
        if (o && typeof o === "object") {
          for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
            if (typeof v === "string" && v.trim()) m.set(k, v.trim());
          }
        }
        setCatalogDbThesisTitles(m);
        const mm = new Map<string, string>();
        if (microObj && typeof microObj === "object") {
          for (const [k, v] of Object.entries(microObj as Record<string, unknown>)) {
            if (typeof v === "string" && v.trim()) mm.set(k, v.trim());
          }
        }
        setCatalogDbThesisMicroLabels(mm);
        const bm = new Map<string, unknown>();
        if (bodiesObj && typeof bodiesObj === "object") {
          for (const [k, v] of Object.entries(bodiesObj as Record<string, unknown>)) {
            if (v !== undefined && v !== null && typeof v === "object") bm.set(k, v);
          }
        }
        setCatalogDbThesisBodies(bm);
        const sm = new Map<string, string>();
        if (slugsObj && typeof slugsObj === "object") {
          for (const [k, v] of Object.entries(slugsObj as Record<string, unknown>)) {
            if (typeof v === "string" && v.trim()) sm.set(k, v.trim());
          }
        }
        setCatalogDbThesisSlugs(sm);
        const pm = new Map<string, CatalogThesisScenarioProbabilities>();
        if (scenObj && typeof scenObj === "object") {
          for (const [k, v] of Object.entries(scenObj as Record<string, unknown>)) {
            if (!k.trim() || !v || typeof v !== "object" || Array.isArray(v)) continue;
            const t = v as Record<string, unknown>;
            const b = t.base;
            const bu = t.bull;
            const be = t.bear;
            if (typeof b === "number" && typeof bu === "number" && typeof be === "number") {
              pm.set(k.trim(), { base: Math.round(b), bull: Math.round(bu), bear: Math.round(be) });
            }
          }
        }
        setCatalogDbThesisScenarioProbabilities(pm);
        const lm = new Map<string, ThesisLifecycleState>();
        if (lifecycleObj && typeof lifecycleObj === "object") {
          for (const [k, v] of Object.entries(lifecycleObj as Record<string, unknown>)) {
            const ls = parseLifecycleState(v);
            if (k.trim() && ls) lm.set(k.trim(), ls);
          }
        }
        setCatalogDbThesisLifecycleStates(lm);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const evidenceTickerItems = useMemo(
    () => evidenceRowsToTickerItems(evidenceLog, resolveThesisDisplayTitle),
    [evidenceLog, resolveThesisDisplayTitle],
  );

  const tickerItems = evidenceTickerItems;

  const mergeThesisCb = useCallback(
    (t: Thesis) => thesisWithSyncedLiveProbability(mergeThesis(t, overrides[t.id])),
    [overrides],
  );

  useEffect(() => {
    setStarred(loadStarred());
    setOpenIds(openPositionThesisIds());
    setPrefs(loadPrefs());
    setUserTheses(loadUserTheses());

    const sb = createSbClient();
    let cancelled = false;
    void (async () => {
      const snap = await hydrateDepth4AccountState(sb);
      if (cancelled) return;
      alertAccountStateRef.current = mergeDepth4AlertStateRecords(alertAccountStateRef.current, snap.alertState);
      setStarred(snap.starred);
      setPrefs(snap.notifyPrefs);
      setUserTheses(loadUserTheses());
      setOpenIds(openPositionThesisIds());
      setAlerts((cur) => applyDepth4AlertStateMapToAlerts(cur, snap.alertState));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sb = createSbClient();
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setAlerts([]);
        alertAccountStateRef.current = {};
        return;
      }
      if (event !== "SIGNED_IN" || !session?.user) return;
      const snap = await hydrateDepth4AccountState(sb);
      alertAccountStateRef.current = mergeDepth4AlertStateRecords(alertAccountStateRef.current, snap.alertState);
      setStarred(snap.starred);
      setPrefs(snap.notifyPrefs);
      setUserTheses(loadUserTheses());
      setOpenIds(openPositionThesisIds());
      setAlerts((cur) => applyDepth4AlertStateMapToAlerts(cur, snap.alertState));
    });
    return () => subscription.unsubscribe();
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

  const pushAlert = useCallback((a: Omit<ThesisAlertEntry, "createdAt" | "read">) => {
    if (alertAccountStateRef.current[a.id] === "dismissed") return;
    const read = alertAccountStateRef.current[a.id] === "read";
    const entry: ThesisAlertEntry = {
      ...a,
      read,
      createdAt: Date.now(),
    };
    setAlerts((cur) => {
      const idx = cur.findIndex((x) => x.id === entry.id);
      if (idx >= 0) {
        return cur.map((x, i) => (i === idx ? { ...entry, read: x.read || entry.read } : x));
      }
      return [entry, ...cur].slice(0, MAX_ALERTS);
    });
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
    alertsReplayedRef.current = false;
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
      // Match server cron eligibility in spirit: any active-ish user thesis with DB row gets evidence;
      // we must poll its thesis_id here or only starred catalog theses would refresh in UI.
      const priority = evidencePollPriorityThesisIdRef.current;
      const ids = buildEvidencePollThesisIds({
        starred: starredRef.current,
        openIds: openIdsRef.current,
        userTheses: loadUserTheses(),
        priorityIds: priority ? [priority] : [],
      });
      if (!ids.length) {
        if (!cancelled) setEvidenceLog([]);
        return;
      }

      const { data } = await sb
        .from("thesis_evidence_log")
        .select("id,created_at,thesis_id,event_type,description,probability_before,probability_after,metadata")
        .in("thesis_id", ids)
        .order("created_at", { ascending: false })
        .limit(EVIDENCE_LOG_POLL_ROW_LIMIT);

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
        // First poll: merge latest non-seed scenario triple per thesis from **historical** rows too.
        // Previously only "fresh" rows after boot updated overrides — evidence never applied → stuck 40/35/25.
        const latestByThesis = new Map(
          latestNonSeedScenarioTripleByThesisId(
            rows.map((r) => ({ thesisId: r.thesisId, createdAt: r.createdAt, probabilityAfter: r.probabilityAfter })),
          ),
        );
        // Global `order(created_at desc).limit(N)` starves low-volume theses: newest rows may all be for one id.
        // Per-thesis fetch fills polled catalog ids missing from the batch so `/theses` can leave starter templates.
        const missingCatalogPollIds = ids.filter((tid) => isSystemThesisId(tid) && !latestByThesis.has(tid));
        if (missingCatalogPollIds.length > 0) {
          const gapResults = await Promise.all(
            missingCatalogPollIds.map(async (thesisId) => {
              const triple = await fetchLatestNonSeedScenarioTripleFromEvidenceLog(sb, thesisId);
              return triple ? ([thesisId, triple] as const) : null;
            }),
          );
          for (const entry of gapResults) {
            if (entry) latestByThesis.set(entry[0], entry[1]);
          }
        }
        const bootTriples = Array.from(latestByThesis.values());
        const discardBootBulk = catalogResolvedTriplesLookLikeBulkWriterCollapse(bootTriples);
        if (latestByThesis.size > 0 && !discardBootBulk) {
          setOverrides((prev) => {
            const next = { ...prev };
            latestByThesis.forEach((triple, thesisId) => {
              const bt = baseThesisForId(thesisId);
              if (!bt) return;
              next[thesisId] = { ...(next[thesisId] ?? {}), ...scenarioProbPatchFromDb(bt, triple) };
            });
            return next;
          });
        }
        if (!alertsReplayedRef.current) {
          alertsReplayedRef.current = true;
          const userPollIdsBoot = collectEligibleUserThesisPollIdSet(loadUserTheses());
          const nextAlerts: ThesisAlertEntry[] = [];
          for (const r of rows) {
            const pending = buildThesisAlertFromEvidenceRow(r, {
              starred: starredRef.current,
              openIds: openIdsRef.current,
              userPollIds: userPollIdsBoot,
              prefs: prefsRef.current,
              titleForThesisId: resolveThesisDisplayTitle,
            });
            if (!pending) continue;
            const st = alertAccountStateRef.current[pending.id];
            if (st === "dismissed") continue;
            nextAlerts.push({
              ...pending,
              read: st === "read",
              createdAt: r.createdAt,
            });
            if (nextAlerts.length >= MAX_ALERTS) break;
          }
          setAlerts(nextAlerts);
        }
        return;
      }

      const hw = evidenceHighWaterRef.current;
      const fresh = rows.filter((r) => r.createdAt > hw).sort((a, b) => a.createdAt - b.createdAt);
      const userPollIds = collectEligibleUserThesisPollIdSet(loadUserTheses());

      const freshScenarioRows = fresh.filter((r) => r.probabilityAfter && !dbScenarioTripleEqualsSeed(r.probabilityAfter));
      const discardFreshBulk = catalogResolvedTriplesLookLikeBulkWriterCollapse(
        freshScenarioRows.map((r) => r.probabilityAfter!),
      );

      for (const r of fresh) {
        // Scenario patches: any thesis we poll (catalog + eligible user). Do not gate on star —
        // user theses were incorrectly frozen because only starred ∪ book received merges.
        // Skip only the **shared Supabase seed** triple `{base:40,bull:35,bear:25}` — never treat a
        // divergent cron suggestion as "seed" to ignore; that would keep user theses on templates forever.
        if (
          !discardFreshBulk &&
          r.probabilityAfter &&
          !dbScenarioTripleEqualsSeed(r.probabilityAfter)
        ) {
          const bt = baseThesisForId(r.thesisId);
          if (bt) {
            setOverrides((o) => ({
              ...o,
              [r.thesisId]: { ...(o[r.thesisId] ?? {}), ...scenarioProbPatchFromDb(bt, r.probabilityAfter!) },
            }));
          }
        }

        if (
          !isFreshEvidenceAlertEligible({
            thesisId: r.thesisId,
            starred: starredRef.current,
            openIds: openIdsRef.current,
            userPollIds,
          })
        ) {
          continue;
        }

        const pref = prefsRef.current[r.thesisId] ?? "major";
        if (pref === "mute") continue;

        const title = resolveThesisDisplayTitle(r.thesisId);
        const signalLevel = typeof r.metadata?.signal_level === "number" ? r.metadata.signal_level : 0;

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
              id: evidenceLogRowStableAlertId(r.id),
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
              ? "Branch odds tilt toward this thesis paying roughly on plan — still size and trail per Trade plan; do not invent a new entry here."
              : scenarioLabel === "bear"
                ? "Branch odds tilt toward invalidation — follow Invalidation and Book; trim or retire the line per your rules."
                : "Same thesis, choppier path — keep size cautious until drivers line up cleanly.";

          pushAlert({
            id: evidenceLogRowStableAlertId(r.id),
            thesisId: r.thesisId,
            thesisTitle: title,
            type: "probability_change",
            scenario: scenarioLabel,
            oldProbability: oldP,
            newProbability: newP,
            confirmText: `${displayLabelForDbScenarioKey(scenarioLabel)} ${oldP}% → ${newP}%`,
            consequenceText: `Consequence: ${consequenceText}`,
            impact: scenarioLabel === "bear" ? "major_negative" : scenarioLabel === "bull" ? "major_positive" : "neutral",
          });

          if (bigMove || (leadChanged && scenarioLabel !== "base")) {
            pushToast(`${title}: ${displayLabelForDbScenarioKey(scenarioLabel)} ${oldP}% → ${newP}%`);
          }
        } else {
          const should = pref === "any" || (pref === "major" && signalLevel >= 4);
          if (!should) continue;

          pushAlert({
            id: evidenceLogRowStableAlertId(r.id),
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
  }, [pushAlert, pushToast, starredKey, openIdsKey, resolveThesisDisplayTitle, evidencePollPriorityNonce]);

  useEffect(() => {
    // Read flow_anomalies for followed theses only (starred ∪ open book) — matches server cron scan scope.
    const sb = createSbClient();

    let cancelled = false;
    const tick = async () => {
      const priority = evidencePollPriorityThesisIdRef.current;
      const watchIds = buildEvidencePollThesisIds({
        starred: starredRef.current,
        openIds: openIdsRef.current,
        userTheses: loadUserTheses(),
        priorityIds: priority ? [priority] : [],
      });
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
  }, [plan, starredKey, openIdsKey, evidencePollPriorityNonce]);

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
    // Snapshot before setState so async persist matches the click (avoids ref/state race with getUser()).
    const wasStarred = starredRef.current.has(thesisId);
    const willStar = !wasStarred;

    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(thesisId)) next.delete(thesisId);
      else next.add(thesisId);
      saveStarred(next);
      return next;
    });

    // Best-effort: persist star to Supabase for server-side cron scanning (only if signed in).
    const sb = createSbClient();
    void sb.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      if (willStar) {
        const r = await sb.from("thesis_stars").upsert({ user_id: uid, thesis_id: thesisId });
        if (!r.error) await appendDepth4ThesisStarEvent(sb, { userId: uid, thesisId, action: "star" });
      } else {
        const r = await sb.from("thesis_stars").delete().eq("user_id", uid).eq("thesis_id", thesisId);
        if (!r.error) await appendDepth4ThesisStarEvent(sb, { userId: uid, thesisId, action: "unstar" });
      }
    });
  }, [openIds]);

  const sortPinnedFirst = useCallback(
    (list: Thesis[]) => {
      const merged = list.map((t) => thesisWithSyncedLiveProbability(mergeThesis(t, overrides[t.id])));
      const pinned = merged.filter((t) => starred.has(t.id) || openIds.has(t.id));
      const rest = merged.filter((t) => !starred.has(t.id) && !openIds.has(t.id));
      return [...sortThesesForDashboard(pinned), ...sortThesesForDashboard(rest)];
    },
    [overrides, starred, openIds],
  );

  const dismissAlert = useCallback((id: string) => {
    alertAccountStateRef.current[id] = "dismissed";
    void persistDepth4AlertStates([{ alert_key: id, state: "dismissed" }], { action: "dismiss" });
    setAlerts((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const markAllRead = useCallback(() => {
    setAlerts((cur) => {
      const unread = cur.filter((x) => !x.read);
      if (unread.length > 0) {
        void persistDepth4AlertStates(unread.map((x) => ({ alert_key: x.id, state: "read" })), { action: "markAllRead" });
        for (const x of unread) alertAccountStateRef.current[x.id] = "read";
      }
      return cur.map((x) => ({ ...x, read: true }));
    });
  }, []);

  const markReadOnOpen = useCallback(() => {
    setAlerts((cur) => {
      const unread = cur.filter((x) => !x.read);
      if (unread.length > 0) {
        void persistDepth4AlertStates(unread.map((x) => ({ alert_key: x.id, state: "read" })), { action: "markReadOnOpen" });
        for (const x of unread) alertAccountStateRef.current[x.id] = "read";
      }
      return cur.map((x) => (x.read ? x : { ...x, read: true }));
    });
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

  const value = useMemo<Ctx>(() => {
    return {
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
      registerEvidenceLogPollPriorityThesisId,
      insiderFlowWatchedCount,
      catalogDbThesisTitles,
      catalogDbThesisMicroLabels,
      catalogDbThesisBodies,
      catalogDbThesisSlugs,
      catalogDbThesisScenarioProbabilities,
      catalogDbThesisLifecycleStates,
    };
  },
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
      registerEvidenceLogPollPriorityThesisId,
      insiderFlowWatchedCount,
      catalogDbThesisTitles,
      catalogDbThesisMicroLabels,
      catalogDbThesisBodies,
      catalogDbThesisSlugs,
      catalogDbThesisScenarioProbabilities,
      catalogDbThesisLifecycleStates,
    ],
  );

  return <ThesisLiveContext.Provider value={value}>{children}</ThesisLiveContext.Provider>;
}
