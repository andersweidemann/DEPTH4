"use client";

import type { DeepBrief } from "@/types/deepBrief";
import { cn } from "@/lib/utils";

export interface DeepBriefPanelProps {
  brief: DeepBrief | null | undefined;
  userHoldings: string[]; // ticker symbols from portfolio
  isPaid: boolean; // Analyst or Pro plan
  onUpgrade: () => void;
  isGenerating?: boolean;
  onGenerate?: () => void;
}

function normTick(t: string): string {
  return (t || "").trim().toUpperCase().split(".", 1)[0] || "";
}

export function DeepBriefPanel({
  brief,
  userHoldings,
  isPaid,
  onUpgrade,
  isGenerating,
  onGenerate,
}: DeepBriefPanelProps) {
  const hold = new Set((userHoldings || []).map(normTick).filter(Boolean));
  const has = Boolean(brief && (brief.hook || brief.market || (brief.stocks && brief.stocks.length)));

  if (isGenerating) {
    return (
      <div className="d4-dm-block" style={{ marginTop: 10, textAlign: "center", padding: "36px 12px" }}>
        <span className="d4-live-dot" aria-hidden style={{ display: "inline-block", marginRight: 8 }} />
        <span className="d4-bubble-meta" style={{ fontSize: 12 }}>
          Generating brief…
        </span>
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
          onClick={onGenerate}
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

  const paywalled = !isPaid;

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
            filter: paywalled ? "blur(5px)" : "none",
            opacity: paywalled ? 0.45 : 1,
            pointerEvents: paywalled ? "none" : "auto",
          }}
        >
          <div className="d4-dm-kicker" style={{ color: "var(--d4-faint)", marginBottom: 6 }}>MARKET READ</div>
          <p className="d4-dm-block" style={{ margin: 0, fontSize: 12, color: "var(--d4-text)", lineHeight: 1.55 }}>
            {market || "—"}
          </p>

          <div style={{ marginTop: 12 }}>
            <div className="d4-dm-kicker" style={{ color: "var(--d4-faint)", marginBottom: 6 }}>STOCK CONVICTION</div>
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

        {paywalled && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 12,
            }}
          >
            <div
              className="d4-dm-block"
              style={{
                width: "100%",
                maxWidth: 420,
                border: "1px solid var(--d4-divider)",
                background: "rgba(10,10,12,0.92)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--d4-text)" }}>🔒 Deep Brief — Analyst</div>
                  <div className="d4-bubble-meta" style={{ fontSize: 12, marginTop: 4 }}>
                    Market read &amp; stock conviction for every story
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <span className="d4-btag">Free: Situation only</span>
                <span className="d4-btag d4-btag--impact" style={{ borderColor: "var(--d4-gold)", color: "var(--d4-gold)" }}>
                  Analyst $19/mo
                </span>
              </div>
              <button
                type="button"
                className="d4-btn d4-btn-ghost"
                style={{ marginTop: 12, width: "100%", justifyContent: "center", borderColor: "var(--d4-gold)", color: "var(--d4-gold)" }}
                onClick={onUpgrade}
              >
                Unlock Analyst
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

