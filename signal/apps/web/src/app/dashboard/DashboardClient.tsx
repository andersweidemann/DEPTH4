"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { mapToFeedViewModel } from "@/lib/mapToFeedViewModel";
import { NotificationSettings } from "@/components/push/NotificationSettings";
import { isProOrAbove, tierLabel } from "@/lib/tier";
import { Activity, FileText, LayoutList, ListOrdered, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import * as T from "./types";
import { Depth4FeedBubble } from "@/components/depth4/Depth4FeedBubble";
import { Depth4L4Panel } from "@/components/depth4/Depth4L4Panel";
import { edgeScoreForPosition } from "@/lib/depth4View";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const FEED_POLL_MS = 60_000;
const DISMISSED_L4_KEY = "depth4_dismissed_l4_ids";
/** After a successful idle-mode ingest, skip re-running until next browser session. */
const IDLE_INGEST_BOOTSTRAP_KEY = "depth4_idle_ingest_bootstrap_ok";
let idleIngestBootstrapPromise: Promise<void> | null = null;

/** When API has background loops off, run one ingest-session on first dashboard load (deduped). */
async function tryIdleIngestBootstrap(
  sb: ReturnType<typeof createClient>,
  apiBase: string,
): Promise<void> {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(IDLE_INGEST_BOOTSTRAP_KEY) === "1") return;
  const base = apiBase.replace(/\/$/, "");
  const run = async () => {
    try {
      const hz = await fetch(`${base}/healthz`);
      if (!hz.ok) return;
      const meta = (await hz.json()) as { background_llm_loops?: boolean };
      if (meta.background_llm_loops !== false) return;
      const { data: { session } } = await sb.auth.getSession();
      const tok = session?.access_token;
      if (!tok) return;
      const ir = await fetch(`${base}/market/ingest-session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (ir.ok) sessionStorage.setItem(IDLE_INGEST_BOOTSTRAP_KEY, "1");
    } catch {
      /* API unreachable — feed still loads from Supabase */
    }
  };
  if (!idleIngestBootstrapPromise) {
    idleIngestBootstrapPromise = run().finally(() => {
      idleIngestBootstrapPromise = null;
    });
  }
  await idleIngestBootstrapPromise;
}

type Tab = "feed" | "portfolio" | "orders" | "briefing";

function normT(t: string) {
  return t.toUpperCase().split(".", 1)[0] || "";
}

export function DashboardClient() {
  const sp = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "feed";
  const r = useRouter();
  const goTab = (t: string) => r.replace(t === "feed" ? "/dashboard" : `/dashboard?tab=${t}`);
  const sb = createClient();
  const [n, setN] = useState<T.NewsItem[]>([]);
  const [p, setP] = useState<T.Pos[]>([]);
  const [od, setOd] = useState<T.Ord[]>([]);
  const [pr, setPr] = useState<Record<string, T.Q>>({});
  const [treeMap, setTreeMap] = useState<Record<string, T.Tree>>({});
  const [l4, sL4] = useState<T.NewsItem | null>(null);
  const [br, sBr] = useState<T.Brief | null>(null);
  const [tier, sTier] = useState("free");
  const [al, sAl] = useState(0);
  const [ugr, sUp] = useState(false);
  const [active, sAct] = useState<T.NewsItem | null>(null);
  const [aTree, sAT] = useState<T.Tree | null>(null);
  const [feedUpdating, sFeedUp] = useState(false);
  const [lastSynced, sLast] = useState<string | null>(null);
  const acknowledgedL4Ref = useRef<Set<string>>(new Set());
  const feedFocusEventIdRef = useRef<string | null>(null);
  const [expId, sExp] = useState<string | null>(null);
  const [addOpen, sAdd] = useState(false);
  const [addErr, sAddErr] = useState<string | null>(null);
  const [tickerIn, sTick] = useState("");
  const [nameIn, sName] = useState("");
  const [qtyIn, sQty] = useState("");
  const [costIn, sCost] = useState("");
  const [curIn, sCur] = useState("SEK");
  const [saving, sSave] = useState(false);
  const [premLoading, sPremL] = useState(false);
  const [premErr, sPremE] = useState<string | null>(null);
  const [premJson, sPremJ] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const j = sessionStorage.getItem(DISMISSED_L4_KEY);
      if (j) acknowledgedL4Ref.current = new Set(JSON.parse(j) as string[]);
    } catch { /* */ }
  }, []);

  const rememberL4Dismissed = useCallback((eventId: string) => {
    acknowledgedL4Ref.current.add(eventId);
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(DISMISSED_L4_KEY, JSON.stringify(Array.from(acknowledgedL4Ref.current)));
    } catch { /* */ }
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean; skipIdleBootstrap?: boolean }) => {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
          r.replace("/login");
          return;
        }
        const { data: urow } = await sb
          .from("users")
          .select("onboarding_complete, tier, alerts_m3_m4_count_month")
          .eq("id", user.id)
          .single();
        const ur = urow as T.User | null;
        sTier(ur?.tier || "free");
        sAl(ur?.alerts_m3_m4_count_month || 0);
        if (ur?.tier === "free" && (ur.alerts_m3_m4_count_month || 0) >= 2) sUp(true);
        if (!ur?.onboarding_complete) {
          r.replace("/onboarding");
          return;
        }
        if (!opts?.skipIdleBootstrap) {
          await tryIdleIngestBootstrap(sb, API);
        }
        const { data: pos } = await sb
          .from("portfolio_positions")
          .select("id, ticker, company_name, quantity, avg_cost, currency")
          .eq("user_id", user.id);
        setP((pos as T.Pos[]) || []);
        const tset = new Set(((pos as T.Pos[]) || []).map((x) => normT(x.ticker)));
        const { data: news } = await sb
          .from("news_events")
          .select("id, headline, body_text, source, published_at, signal_level, affected_tickers, one_line_summary, raw_json")
          .order("published_at", { ascending: false })
          .limit(200);
        let m = (news as T.NewsItem[]) || [];
        m = [...m].sort((a, b) => {
          const oa = (a.affected_tickers || []).some((t) => tset.has(normT(t)));
          const ob = (b.affected_tickers || []).some((t) => tset.has(normT(t)));
          if (oa !== ob) return oa ? -1 : 1;
          return b.signal_level - a.signal_level;
        });
        const { data: dism } = await sb
          .from("user_dismissed_events")
          .select("event_id")
          .eq("user_id", user.id);
        const hidden = new Set(
          (dism || [])
            .map((row: { event_id: string }) => row.event_id)
            .filter(Boolean) as string[],
        );
        m = m.filter((e) => !hidden.has(e.id));
        setN(m);
        const f = m[0] || null;
        const prefer = feedFocusEventIdRef.current ? m.find((e) => e.id === feedFocusEventIdRef.current) || f : f;
        if (prefer) {
          sAct(prefer);
          const t = await sb
            .from("consequence_trees")
            .select("*")
            .eq("event_id", prefer.id)
            .order("generated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (t.data) sAT(t.data as T.Tree);
          else sAT(null);
        } else {
          sAct(null);
          sAT(null);
        }
        const map: Record<string, T.Tree> = {};
        for (const e of m.filter((x) => x.signal_level >= 3)) {
          const t = await sb
            .from("consequence_trees")
            .select("*")
            .eq("event_id", e.id)
            .order("generated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (t.data) map[e.id] = t.data as T.Tree;
        }
        setTreeMap(map);
        const toSurface = m.find(
          (e) => e.signal_level >= 4 && !acknowledgedL4Ref.current.has(e.id),
        );
        if (toSurface) sL4(toSurface);
        else sL4(null);
        const { data: ods } = await sb
          .from("open_orders")
          .select("id, ticker, limit_price, direction, status")
          .eq("user_id", user.id)
          .eq("status", "active");
        setOd((ods as T.Ord[]) || []);
        const pt = ((pos as T.Pos[]) || []).map((x) => x.ticker).filter(Boolean) as string[];
        if (pt.length) {
          try {
            const res = await fetch(`${API}/market/quote?ticker=${encodeURIComponent(pt.join(","))}`);
            if (res.ok) {
              const j = (await res.json()) as { quotes: Record<string, T.Q> };
              setPr(j.quotes || {});
            }
          } catch {
            setPr({});
          }
        }
        const { data: bf } = await sb
          .from("briefings")
          .select("content_markdown, briefing_date, briefing_type")
          .eq("user_id", user.id)
          .order("briefing_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        sBr(bf as T.Brief | null);
        sLast(
          new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        );
      } finally {
        if (!opts?.silent) sFeedUp(false);
      }
    },
    [r, sb, API],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    sPremJ(null);
    sPremE(null);
  }, [active?.id]);

  const runPremiumPersonalize = useCallback(async () => {
    if (!active?.id) return;
    const tree = (treeMap as Record<string, T.Tree>)[active.id];
    const sc = tree?.scenarios;
    if (!Array.isArray(sc) || sc.length < 1) {
      sPremE("No scenario matrix for this story yet — refresh after the server ingests it.");
      return;
    }
    sPremL(true);
    sPremE(null);
    sPremJ(null);
    try {
      const { data: { session } } = await sb.auth.getSession();
      const tok = session?.access_token;
      if (!tok) {
        sPremE("Not signed in.");
        return;
      }
      const res = await fetch(`${API}/market/premium-personalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify({ event_id: active.id }),
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { detail?: string };
      if (!res.ok) {
        const d = j.detail;
        sPremE(typeof d === "string" ? d : res.status === 503 ? "Premium LLM not configured on API (Anthropic key)." : `Request failed (${res.status})`);
        return;
      }
      sPremJ(j);
    } catch (e) {
      sPremE(e instanceof Error ? e.message : "Network error");
    } finally {
      sPremL(false);
    }
  }, [active?.id, sb, treeMap]);

  const refreshNow = useCallback(async () => {
    sFeedUp(true);
    try {
      const hz = await fetch(`${API}/healthz`);
      const meta = (await hz.json().catch(() => ({}))) as { background_llm_loops?: boolean };
      const loopsOff = meta.background_llm_loops === false;
      const { data: { session } } = await sb.auth.getSession();
      const tok = session?.access_token;
      if (loopsOff && tok) {
        await fetch(`${API}/market/ingest-session`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tok}` },
        });
      }
    } catch {
      /* offline or API down — still reload cached feed */
    }
    await load({ skipIdleBootstrap: true });
  }, [load, sb]);

  const onDismissEvent = useCallback(
    async (eventId: string) => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { error } = await sb.from("user_dismissed_events").insert({ user_id: user.id, event_id: eventId });
      if (error) return;
      if (l4?.id === eventId) sL4(null);
      if (eventId === feedFocusEventIdRef.current) {
        feedFocusEventIdRef.current = null;
      }
      sExp((cur) => (cur === eventId ? null : cur));
      const wasActive = active?.id === eventId;
      setN((prev) => {
        const next = prev.filter((e) => e.id !== eventId);
        if (wasActive) {
          const f = next[0] || null;
          queueMicrotask(() => {
            sAct(f);
            sAT(
              f ? (treeMap as Record<string, T.Tree>)[f.id] ?? null : null,
            );
            if (f) feedFocusEventIdRef.current = f.id;
          });
        }
        return next;
      });
    },
    [sb, l4, active, treeMap],
  );

  useEffect(() => {
    const t = setInterval(() => {
      void load({ silent: true, skipIdleBootstrap: true });
    }, FEED_POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!active) return;
    const t = treeMap[active.id];
    if (t) sAT(t);
  }, [treeMap, active]);

  const tsek = useMemo(
    () =>
      p.reduce((ac, x) => {
        const q = pr[x.ticker] as T.Q | undefined;
        if (!q?.price_sek) return ac;
        return ac + +x.quantity * (q as T.Q).price_sek;
      }, 0),
    [p, pr],
  );

  const l4OverlayVm = useMemo(
    () => (l4 ? mapToFeedViewModel(l4, treeMap[l4.id] ?? null, p, od, pr) : null),
    [l4, treeMap, p, od, pr],
  );

  const activeVm = useMemo(
    () =>
      active
        ? mapToFeedViewModel(
            active,
            (treeMap as Record<string, T.Tree>)[active.id] ?? null,
            p,
            od,
            pr,
          )
        : null,
    [active, treeMap, p, od, pr],
  );

  const posTickers = useMemo(
    () => new Set(p.map((x) => normT(x.ticker))),
    [p],
  );

  const affForEdge = useMemo(
    () => new Set((active?.affected_tickers || []).map((t) => normT(t))),
    [active],
  );

  const saveHolding = useCallback(async () => {
    sAddErr(null);
    const tick = tickerIn.trim().toUpperCase();
    const name = nameIn.trim();
    const q = +qtyIn;
    const c = +costIn;
    if (!tick || !q || !Number.isFinite(c)) {
      sAddErr("Add ticker, quantity, and average cost.");
      return;
    }
    sSave(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      sSave(false);
      return;
    }
    const { error } = await sb.from("portfolio_positions").insert({
      user_id: user.id,
      ticker: tick,
      company_name: name || null,
      quantity: q,
      avg_cost: c,
      currency: curIn,
      manual_or_connected: "manual",
    } as never);
    sSave(false);
    if (error) {
      sAddErr(error.message || "Could not save");
      return;
    }
    sAdd(false);
    sTick("");
    sName("");
    sQty("");
    sCost("");
    sCur("SEK");
    void load();
  }, [tickerIn, nameIn, qtyIn, costIn, curIn, sb, load]);

  const onSignOut = useCallback(async () => {
    await sb.auth.signOut();
    r.replace("/login");
  }, [r, sb]);

  return (
    <>
      {l4 && l4OverlayVm && (
        <div className="d4-backdrop d4-backdrop--open" style={{ zIndex: 200 }} role="alertdialog" aria-modal="true">
          <div className="d4-l4-prompt" style={{ textAlign: "left" }} role="document">
            <h2 className="d4-mtitle" style={{ color: "var(--d4-text)" }}>High signal — read first</h2>
            <p style={{ color: "var(--d4-muted)", fontSize: 14, marginTop: 6 }}>{l4OverlayVm.notificationText}</p>
            {l4 && <p className="d4-bubble-meta" style={{ fontSize: 12, marginTop: 8 }}>{l4.headline}</p>}
            <button
              className="d4-btn d4-btn-ghost"
              type="button"
              style={{ width: "100%", marginTop: 14, justifyContent: "center", padding: 10, fontSize: 14, background: "var(--d4-s3)" }}
              onClick={() => {
                if (l4) rememberL4Dismissed(l4.id);
                sL4(null);
              }}
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {ugr && (
        <div
          className="d4-btn-ghost d4-btag d4-btag--energy"
          style={{
            position: "fixed",
            bottom: 80,
            left: 8,
            right: 8,
            zIndex: 25,
            textAlign: "center",
            padding: 8,
            fontSize: 11,
          }}
          role="status"
        >
          You have {3 - al} Depth 3+ alerts left this month on Free.{" "}
          <button type="button" className="d4-btn" style={{ textDecoration: "underline" }} onClick={() => sUp(false)}>
            Dismiss
          </button>
        </div>
      )}

      {addOpen && (
        <div
          className="d4-backdrop d4-backdrop--open"
          role="presentation"
          onClick={() => sAdd(false)}
        >
          <div
            className="d4-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            aria-labelledby="addHoldingTitle"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <h2 className="d4-mtitle" id="addHoldingTitle">Add holding</h2>
                <p className="d4-bubble-meta" style={{ marginTop: 4, fontSize: 11 }}>Saves to your book (SEK or chosen currency for cost basis).</p>
              </div>
              <button type="button" className="d4-btn d4-btn-ghost" onClick={() => sAdd(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="d4-form-grid2">
              <div>
                <label className="d4-flabel" htmlFor="fT">Ticker</label>
                <input id="fT" className="d4-input" value={tickerIn} onChange={(e) => sTick(e.target.value.toUpperCase())} placeholder="FCX" autoComplete="off" />
              </div>
              <div>
                <label className="d4-flabel" htmlFor="fN">Company (optional)</label>
                <input id="fN" className="d4-input" value={nameIn} onChange={(e) => sName(e.target.value)} placeholder="Name" />
              </div>
            </div>
            <div className="d4-form-grid2">
              <div>
                <label className="d4-flabel" htmlFor="fQ">Shares / units</label>
                <input id="fQ" className="d4-input" type="number" min="0" step="any" value={qtyIn} onChange={(e) => sQty(e.target.value)} />
              </div>
              <div>
                <label className="d4-flabel" htmlFor="fC">Average cost (per share)</label>
                <input id="fC" className="d4-input" type="number" min="0" step="any" value={costIn} onChange={(e) => sCost(e.target.value)} />
              </div>
            </div>
            <div className="d4-form-row">
              <label className="d4-flabel" htmlFor="fCur">Currency</label>
              <select id="fCur" className="d4-input" value={curIn} onChange={(e) => sCur(e.target.value)}>
                <option value="SEK">SEK</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            {addErr && <div className="d4-ferr" role="alert" style={{ display: "block" }}>{addErr}</div>}
            <div className="d4-form-row" style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
              <button type="button" className="d4-btn d4-btn-ghost" onClick={() => sAdd(false)}>Cancel</button>
              <button type="button" className="d4-btn d4-btn-ghost" style={{ background: "var(--d4-gold)", color: "#14100a", border: "none" }} onClick={saveHolding} disabled={saving}>
                {saving ? "Saving…" : "Save holding"}
              </button>
            </div>
            <p className="d4-disclaimer" style={{ margin: 0 }}>Not financial advice. Position data is for illustration in DEPTH4 only.</p>
          </div>
        </div>
      )}

      <div className="d4-app" style={{ paddingBottom: 0 }}>
        <header className="d4-topbar" style={{ flexWrap: "wrap" }}>
          <div className="d4-logo">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden>
              <rect x=".75" y=".75" width="18.5" height="18.5" rx="4" stroke="currentColor" strokeWidth="1.3" />
              <path d="M5 10h10M10 5v10" stroke="var(--d4-gold)" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="10" cy="10" r="2.7" stroke="var(--d4-gold)" strokeWidth="1.3" />
            </svg>
            DEPTH4
          </div>
          <span className="d4-tagline">Geopol + macro, your book</span>
          <span className="d4-spacer" style={{ minWidth: 0 }} />
          <span className="d4-live-dot" aria-hidden />
          <span className="d4-live-label">LIVE</span>
          {lastSynced && <span className="d4-bubble-meta" style={{ fontSize: 11, color: "var(--d4-muted)" }}>Updated {lastSynced}</span>}
          <span className="d4-spacer" />
          <span className="d4-bubble-src d4-bubble-meta" style={{ fontSize: 10, padding: "2px 8px" }}>{tierLabel(tier)}</span>
          <Link href="/pricing" className="d4-btn d4-btn-ghost" style={{ textDecoration: "none" }}>Plans</Link>
          <Link href="/" className="d4-btn d4-btn-ghost" style={{ textDecoration: "none" }}>App home</Link>
          <button type="button" className="d4-btn d4-btn-ghost" onClick={() => sAdd(true)}>+ Add holding</button>
          <button type="button" className="d4-btn d4-btn-ghost" onClick={onSignOut}>Sign out</button>
        </header>

        <aside className="d4-sidebar" aria-label="Portfolio">
          <div className="d4-kicker">Portfolio</div>
          <div className="d4-sidecard">
            <p className="d4-bubble-meta" style={{ marginBottom: 4, fontSize: 11 }}>Total value (est.)</p>
            <p className="d4-total" style={{ color: "var(--d4-text)" }}>
              {tsek > 0 ? tsek.toLocaleString("sv-SE", { maximumFractionDigits: 0 }) : "—"}{" "}
              <span className="d4-bubble-meta" style={{ fontSize: 14 }}>SEK</span>
            </p>
            <p className="d4-bubble-meta" style={{ fontSize: 10, lineHeight: 1.4 }}>Quotes from DEPTH4 API. Unrealized P&amp;L: compare to avg cost in a later build.</p>
          </div>
          <div className="d4-sidecard">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span className="d4-kicker" style={{ marginBottom: 0 }}>Holdings</span>
              <button type="button" className="d4-btn d4-btn-ghost" style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => sAdd(true)} aria-label="Add holding">
                ＋
              </button>
            </div>
            <div className="d4-pos-list">
              {p.map((x) => {
                const q = pr[x.ticker] as T.Q | undefined;
                const s = (q as T.Q | undefined)?.price_sek;
                const v = s && x.quantity ? s * +x.quantity : null;
                return (
                  <div className="d4-pos" key={x.id}>
                    <div>
                      <div className="d4-tick">{x.ticker}</div>
                      <div className="d4-nm">{x.company_name || "—"}</div>
                    </div>
                    <div className="d4-val">
                      {v != null ? v.toLocaleString("sv-SE", { maximumFractionDigits: 0 }) : "—"}
                      <br />
                      <span className="d4-bubble-meta" style={{ fontSize: 9 }}>{x.currency || "SEK"}</span>
                    </div>
                  </div>
                );
              })}
              {p.length === 0 && <p className="d4-bubble-meta" style={{ fontSize: 12 }}>No positions. Add a holding to personalize L4.</p>}
            </div>
          </div>
          <div className="d4-kicker">Edge scores (illus.)</div>
          <div className="d4-sidecard" style={{ paddingBottom: 6 }}>
            <p className="d4-bubble-meta" style={{ fontSize: 10, lineHeight: 1.5, marginBottom: 6 }}>
              Brighter = more to watch for the active story.
            </p>
            {p.length === 0 && <p className="d4-bubble-meta" style={{ fontSize: 12 }}>—</p>}
            {p.map((x) => {
              const st = affForEdge.has(normT(x.ticker));
              const sc = edgeScoreForPosition(
                x.ticker,
                st ? posTickers : new Set(),
                active?.signal_level ?? 1,
                st,
              );
              const bar = 0.1 + (sc / 100) * 0.9;
              const l = 36 + (sc / 100) * 20;
              const c = `hsla(38,80%,${l + 8}%,${bar})`;
              const b = `hsl(38,${38 + sc * 0.55}%,${l}%)`;
              const g = sc > 65 ? `0 0 5px hsla(38,90%,55%,${(sc - 65) / 120})` : "none";
              return (
                <div className="d4-edge-row" key={x.id}>
                  <div className="d4-etick" style={{ color: c, textShadow: g }}>{x.ticker}</div>
                  <div className="d4-ebar-wrap" aria-hidden>
                    <div
                      className="d4-ebar-fill"
                      style={{ width: `${sc}%`, background: b, boxShadow: g }}
                    />
                  </div>
                  <div className="d4-escore" style={{ color: c }}>{sc}</div>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="d4-main">
          {(!sp.get("tab") || sp.get("tab") === "feed") && (
            <>
              <div className="d4-feed-h">
                <div className="d4-feed-status">
                  <span className="d4-live-dot" aria-hidden />
                  <span>
                    Geopol + macro — feed reloads every {FEED_POLL_MS / 1000}s. If the API has background loops off,
                    Refresh also runs one ingest cycle (uses LLM when new headlines exist).
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="d4-bubble-meta" style={{ fontSize: 10, color: "var(--d4-faint)" }}>Click a card to expand the depth map</span>
                  <button type="button" className="d4-btn d4-btn-ghost" onClick={refreshNow} disabled={feedUpdating} aria-busy={feedUpdating}>
                    <RefreshCw
                      className={cn("h-3.5 w-3.5", feedUpdating && "animate-spin")}
                      style={{ color: "var(--d4-muted)" }}
                    />
                    {feedUpdating ? "…" : "Refresh"}
                  </button>
                  <button
                    type="button"
                    className="d4-btn d4-btn-ghost"
                    style={{ borderColor: "var(--d4-gold)", color: "var(--d4-gold)" }}
                    title="Uses your configured premium model (Anthropic) — not the free background pipeline"
                    onClick={() => void runPremiumPersonalize()}
                    disabled={premLoading || !active?.id || !((treeMap as Record<string, T.Tree>)[active.id]?.scenarios as unknown[] | undefined)?.length}
                  >
                    {premLoading ? "Premium…" : "Premium personalize"}
                  </button>
                </div>
              </div>
              {(premErr || premJson) && (
                <div className="d4-sidecard" style={{ marginBottom: 10 }}>
                  {premErr && (
                    <p className="d4-ferr" role="alert" style={{ margin: 0, fontSize: 12 }}>
                      {premErr}
                    </p>
                  )}
                  {premJson && (
                    <pre
                      className="d4-bubble-meta"
                      style={{ margin: "8px 0 0", fontSize: 10, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflow: "auto" }}
                    >
                      {JSON.stringify(premJson, null, 2)}
                    </pre>
                  )}
                </div>
              )}
              <div className="d4-news-grid" style={{ paddingBottom: 8 }}>
                {n.map((e) => {
                  const userOverlap = (e.affected_tickers || []).filter(
                    (t) => p.some((q) => normT(q.ticker) === normT(t)),
                  );
                  return (
                    <Depth4FeedBubble
                      key={e.id}
                      news={e}
                      model={mapToFeedViewModel(
                        e,
                        (treeMap as Record<string, T.Tree>)[e.id] ?? null,
                        p,
                        od,
                        pr,
                      )}
                      proUnlocked={isProOrAbove(tier)}
                      publishedAt={e.published_at}
                      overlapLabelTickers={userOverlap as string[]}
                      expanded={expId === e.id}
                      onToggle={() => sExp((cur) => (cur === e.id ? null : e.id))}
                      onFocus={() => {
                        feedFocusEventIdRef.current = e.id;
                        sAct(e);
                        sAT((treeMap as Record<string, T.Tree>)[e.id] ?? null);
                      }}
                      onDismiss={() => {
                        void onDismissEvent(e.id);
                      }}
                    />
                  );
                })}
              </div>
              <div className="md:hidden" style={{ marginTop: 4 }}>
                <NotificationSettings />
              </div>
            </>
          )}

          {sp.get("tab") === "briefing" && (
            <article className="d4-prose-brief">
              {br ? <ReactMarkdown>{br.content_markdown}</ReactMarkdown> : (
                <p className="d4-bubble-meta">No briefing. Pro+ gets daily 07:00 and weekend 08:00 in your timezone.</p>
              )}
            </article>
          )}
          {sp.get("tab") === "portfolio" && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {p.map((x) => {
                const q = pr[x.ticker] as T.Q | undefined;
                const s = (q as T.Q | undefined)?.price_sek;
                return (
                  <li
                    className="d4-pos"
                    key={x.id}
                    style={{ width: "100%" }}
                  >
                    <div className="d4-tick">{x.ticker}</div>
                    <div className="d4-val">
                      {s && x.quantity ? (s * +x.quantity).toFixed(0) : "—"} SEK
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {sp.get("tab") === "orders" && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 13, color: "var(--d4-text)" }}>
              {od.map((o) => (
                <li key={o.id} className="d4-dm-block" style={{ marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                  <span>{o.ticker} {o.direction}</span>
                  <span className="d4-bubble-meta">{o.limit_price}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="d4-panel" aria-label="Active story">
          <Depth4L4Panel
            headline={active?.headline || null}
            vm={activeVm}
            aTree={aTree}
          />
          <div className="d4-kicker" style={{ marginTop: 12 }}>Pushes &amp; PWA</div>
          <NotificationSettings className="d4-bubble-meta" />
        </aside>
      </div>

      <nav className="d4-mob" aria-label="Mobile main" style={{ zIndex: 40 }}>
        {(
          [
            ["feed", LayoutList, "Feed"],
            ["portfolio", Activity, "Book"],
            ["orders", ListOrdered, "Orders"],
            ["briefing", FileText, "Briefing"],
          ] as const
        ).map(([a, I, label]) => (
          <button
            type="button"
            key={a}
            onClick={() => goTab(a)}
            className={cn(
              (tab === a || (a === "feed" && !sp.get("tab"))) && "d4-mob--on",
            )}
            style={tab === a || (a === "feed" && !sp.get("tab")) ? { color: "var(--d4-gold)" } : { color: "var(--d4-muted)" }}
          >
            <I className="h-5 w-5" style={{ color: "inherit" }} />
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
