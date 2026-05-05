"use client";

import type { DeepBrief } from "@/types/deepBrief";
import { cn } from "@/lib/utils";
import type { DeepBriefAccess, Plan } from "@/lib/plan";
import { PaywallOverlay } from "@/components/PaywallOverlay";

export interface DeepBriefPanelProps {
  brief: DeepBrief | null | undefined;
  userHoldings: string[]; // ticker symbols from portfolio
  plan: Plan;
  briefAccess: DeepBriefAccess; // false | partial | full
  onUpgradeAnalyst: () => void;
  onUpgradePro: () => void;
  isGenerating?: boolean;
  error?: string | null;
  onGenerate?: () => void;
}

function normTick(t: string): string {
  return (t || "").trim().toUpperCase().split(".", 1)[0] || "";
}

export function DeepBriefPanel({
  brief,
  userHoldings,
  plan,
  briefAccess,
  onUpgradeAnalyst,
  onUpgradePro,
  isGenerating,
  error,
  onGenerate,
}: DeepBriefPanelProps) {
  const hold = new Set((userHoldings || []).map(normTick).filter(Boolean));
  const has = Boolean(brief && (brief.hook || brief.market || (brief.stocks && brief.stocks.length)));

  // Free plan: Deep Brief is fully locked (Situation is not shown here; tab should still be visible).
  if (briefAccess === false) {
    return (
      <div style={{ position: "relative", marginTop: 10, minHeight: 220 }}>
        <div style={{ filter: "blur(5px)", opacity: 0.45, maxHeight: 220, overflow: "hidden" }}>
          <div className="d4-dm-kicker" style={{ color: "var(--d4-faint)", marginBottom: 6 }}>SITUATION</div>
          <p className="d4-dm-block" style={{ margin: 0, fontSize: 12, color: "var(--d4-text)", lineHeight: 1.55 }}>
            {String(brief?.hook || "—")}
          </p>
        </div>
        <PaywallOverlay
          requiredPlan="analyst"
          featureName="Deep Brief"
          currentPlan={plan}
          subtitle="Deep Brief is available on Analyst and Pro plans."
          onUpgrade={onUpgradeAnalyst}
        />
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="d4-dm-block" style={{ marginTop: 10, textAlign: "center", padding: "36px 12px" }}>
        <span className="d4-live-dot" aria-hidden style={{ display: "inline-block", marginRight: 8 }} />
        <span className="d4-bubble-meta" style={{ fontSize: 12 }}>
          Generating brief…
        </span>
        <div className="d4-bubble-meta" style={{ fontSize: 10, color: "var(--d4-muted)", marginTop: 6 }}>
          Usually takes 5–10 seconds
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="d4-dm-block" style={{ marginTop: 10, textAlign: "center", padding: "30px 12px" }}>
        <p className="d4-bubble-meta" style={{ fontSize: 12, margin: 0 }}>
          Brief generation failed.
        </p>
        <p className="d4-bubble-meta" style={{ fontSize: 10, margin: "6px 0 0", color: "var(--d4-muted)" }}>
          {error}
        </p>
        <button
          type="button"
          className="d4-btn d4-btn-ghost"
          style={{ marginTop: 10, justifyContent: "center", borderColor: "var(--d4-gold)", color: "var(--d4-gold)" }}
          onClick={onGenerate}
          disabled={!onGenerate}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!has) {
    return (
      <div className="d4-dm-block" style={{ marginTop: 10, textAlign: "center", padding: "30px 12px" }}>
        <button
          type="button"
          className="d4-btn d4-btn-ghost"
          style={{ borderColor: "var(--d4-gold)", color: "var(--d4-gold)", justifyContent: "center" }}
          onClick={() => {
            // Temporary breadcrumb for debugging click wiring.
            console.log("[DeepBrief] Generate clicked");
            onGenerate?.();
          }}
          disabled={!onGenerate}
          title={!onGenerate ? "Generate handler not wired yet" : undefined}
        >
          ⚡ Generate Deep Brief
        </button>
        <p className="d4-bubble-meta" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.45 }}>
          Synthesizes Depth 1–3 into a trade-ready briefing.
        </p>
      </div>
    );
  }

  const situation = String(brief?.hook || "").trim();
  const market = String(brief?.market || "").trim();
  const stocks = Array.isArray(brief?.stocks) ? brief!.stocks : [];

  const showMarket = briefAccess === "partial" || briefAccess === "full";
  const showStocks = briefAccess === "full";

  return (
    <div style={{ marginTop: 10, position: "relative", maxHeight: 420, overflowY: "auto", paddingRight: 2 }}>
      <div>
        <div className="d4-dm-kicker" style={{ color: "var(--d4-faint)", marginBottom: 6 }}>SITUATION</div>
        <p className="d4-dm-block" style={{ margin: 0, fontSize: 12, color: "var(--d4-text)", lineHeight: 1.55 }}>
          {situation || "—"}
        </p>
      </div>

      <div style={{ marginTop: 12, position: "relative" }}>
        <div
          style={{
            filter: showMarket ? "none" : "blur(5px)",
            opacity: showMarket ? 1 : 0.45,
            pointerEvents: showMarket ? "auto" : "none",
          }}
        >
          <div className="d4-dm-kicker" style={{ color: "var(--d4-faint)", marginBottom: 6 }}>MARKET READ</div>
          <p className="d4-dm-block" style={{ margin: 0, fontSize: 12, color: "var(--d4-text)", lineHeight: 1.55 }}>
            {market || "—"}
          </p>

          <div style={{ marginTop: 12 }}>
            <div className="d4-dm-kicker" style={{ color: "var(--d4-faint)", marginBottom: 6 }}>STOCK CONVICTION</div>
            <div
              style={{
                filter: showStocks ? "none" : "blur(5px)",
                opacity: showStocks ? 1 : 0.45,
                pointerEvents: showStocks ? "auto" : "none",
                maxHeight: 220,
                overflow: "hidden",
              }}
            >
              {stocks.length === 0 ? (
                <p className="d4-bubble-meta" style={{ fontSize: 12, margin: 0 }}>—</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {stocks.map((s, i) => {
                    const t = normTick(s?.t || "");
                    const match = Boolean(t && hold.has(t));
                    return (
                      <li key={`${t}-${i}`} className="d4-dm-block" style={{ fontSize: 12 }}>
                        <span
                          aria-hidden
                          className={cn("d4-sdot", match ? "d4-sdot--g" : "d4-sdot--y")}
                          style={{ display: "inline-block", marginRight: 8, width: 6, height: 6, transform: "translateY(-1px)" }}
                        />
                        <strong style={{ color: match ? "var(--d4-green)" : "var(--d4-gold)", fontWeight: match ? 700 : 600 }}>
                          {t || "—"}
                        </strong>
                        <span style={{ color: "var(--d4-muted)" }}> — {String(s?.th || "").trim() || "—"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {!showMarket && (
          <PaywallOverlay
            requiredPlan="analyst"
            featureName="Deep Brief"
            currentPlan={plan}
            subtitle="Deep Brief (Market Read) is available on Analyst and Pro."
            onUpgrade={onUpgradeAnalyst}
          />
        )}

        {showMarket && !showStocks && (
          <div style={{ position: "relative", marginTop: 10, minHeight: 64 }}>
            <PaywallOverlay
              requiredPlan="pro"
              featureName="Stock Conviction"
              currentPlan={plan}
              subtitle="Stock Conviction (tickers + theses) is available on Pro."
              onUpgrade={onUpgradePro}
            />
          </div>
        )}
      </div>
    </div>
  );
}

