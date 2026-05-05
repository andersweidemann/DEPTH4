"use client";

import { useEffect, useMemo, useState } from "react";

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => onDone(), 600);
    return () => window.clearTimeout(t);
  }, [closing, onDone]);

  const noiseDataUrl = useMemo(() => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">
  <filter id="n">
    <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/>
  </filter>
  <rect width="240" height="240" filter="url(#n)" opacity="1"/>
</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "grid",
        placeItems: "center",
        background: "var(--d4-bg)",
        color: "var(--d4-text)",
        transform: closing ? "translateY(-12px)" : "translateY(0)",
        opacity: closing ? 0 : 1,
        transition: "opacity 0.6s ease, transform 0.6s ease",
      }}
    >
      {/* Glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -60%)",
          width: 600,
          height: 600,
          pointerEvents: "none",
          background: "radial-gradient(circle, rgba(226,164,58,.06) 0%, transparent 70%)",
        }}
      />
      {/* Noise */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: `url("${noiseDataUrl}")`,
          opacity: 0.03,
          mixBlendMode: "overlay",
        }}
      />

      <div style={{ width: "min(920px, 92vw)", textAlign: "center", position: "relative" }}>
        <div
          style={{
            fontFamily: "\"Cabinet Grotesk\", system-ui, sans-serif",
            fontWeight: 700,
            fontSize: "clamp(72px, 11vw, 120px)",
            lineHeight: 0.9,
            letterSpacing: "-0.03em",
            background: "linear-gradient(135deg, #f0ece4 0%, #c8c0b0 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          DEPTH4
        </div>
        <div style={{ marginTop: 14, fontSize: "clamp(22px, 4vw, 34px)", color: "var(--d4-gold)", fontWeight: 700 }}>
          See it before the market does.
        </div>
        <div style={{ marginTop: 10, fontSize: 14, color: "var(--d4-muted)" }}>Your personal geopolitical analyst.</div>

        <button
          type="button"
          className="d4-btn"
          style={{
            marginTop: 26,
            padding: "12px 18px",
            borderRadius: 999,
            background: "var(--d4-gold)",
            color: "#14100a",
            border: "none",
            justifyContent: "center",
            fontSize: 14,
          }}
          onClick={() => setClosing(true)}
        >
          Enter DEPTH4 →
        </button>

        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -56,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            color: "var(--d4-faint)",
            fontSize: 12,
            letterSpacing: 0.04,
          }}
        >
          <div>Live stories ready</div>
          <div className="d4-onb-arrow">↓</div>
        </div>
      </div>

      <style>{`
        @keyframes d4-onb-bounce { 0%,100% { transform: translateY(0); opacity: .9 } 50% { transform: translateY(6px); opacity: .55 } }
        .d4-onb-arrow { animation: d4-onb-bounce 1.1s ease-in-out infinite; font-size: 18px; }
      `}</style>
    </div>
  );
}

