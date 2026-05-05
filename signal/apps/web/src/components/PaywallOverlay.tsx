"use client";

import type { Plan } from "@/lib/plan";
import { planLabel, planPillStyle } from "@/lib/plan";

export interface PaywallOverlayProps {
  requiredPlan: Exclude<Plan, "free">; // analyst | pro
  featureName: string;
  onUpgrade: () => void;
  currentPlan: Plan;
  subtitle?: string;
}

function defaultSubtitle(featureName: string): string {
  const f = featureName.toLowerCase();
  if (f.includes("deep brief")) return "Synthesized briefing per story (trade-ready).";
  if (f.includes("depth clock") || f.includes("clock")) return "Timing + urgency + execution links.";
  if (f.includes("alerts")) return "Get notified when key watch conditions appear.";
  if (f.includes("p&l") || f.includes("sensitivity")) return "Scenario sensitivity for your portfolio.";
  return "Upgrade to unlock this feature.";
}

export function PaywallOverlay({ requiredPlan, featureName, onUpgrade, currentPlan, subtitle }: PaywallOverlayProps) {
  const req = requiredPlan;
  const cur = currentPlan;
  const reqStyle = planPillStyle(req);
  const curStyle = planPillStyle(cur);
  const reqName = planLabel(req);
  const curName = planLabel(cur);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        zIndex: 20,
        background:
          "radial-gradient(600px 280px at 50% 40%, rgba(226,164,58,0.10) 0%, rgba(10,10,12,0.72) 60%, rgba(10,10,12,0.86) 100%)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        className="d4-dm-block"
        style={{
          width: "100%",
          maxWidth: 520,
          border: "1px solid var(--d4-divider)",
          background: "rgba(10,10,12,0.92)",
        }}
      >
        <div style={{ fontSize: 26, lineHeight: 1, marginBottom: 8 }}>🔒</div>
        <div style={{ fontWeight: 800, color: "var(--d4-text)", fontSize: 14 }}>
          {featureName} — {reqName}
        </div>
        <div className="d4-bubble-meta" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
          {subtitle || defaultSubtitle(featureName)}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <span
            className="d4-btag"
            style={{
              color: curStyle.color,
              borderColor: curStyle.border,
              background: curStyle.bg,
            }}
          >
            Current: {curName}
          </span>
          <span
            className="d4-btag"
            style={{
              color: reqStyle.color,
              borderColor: reqStyle.border,
              background: reqStyle.bg,
            }}
          >
            Unlock: {reqName}
          </span>
        </div>

        <button
          type="button"
          className="d4-btn d4-btn-ghost"
          style={{
            marginTop: 12,
            width: "100%",
            justifyContent: "center",
            borderColor: "var(--d4-gold)",
            color: "var(--d4-gold)",
          }}
          onClick={onUpgrade}
        >
          Unlock {reqName}
        </button>
      </div>
    </div>
  );
}

