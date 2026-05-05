"use client";

import { useEffect, useMemo, useState } from "react";

type TourStep = {
  targetSelector: string;
  title: string;
  body: string;
  cta?: { label: string; action: () => void };
};

let tourCompleted = false;

export function OnboardingTour({ onOpenAddHolding }: { onOpenAddHolding: () => void }) {
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number }>({ left: 12, top: 12 });

  const steps: TourStep[] = useMemo(
    () => [
      {
        targetSelector: ".main",
        title: "Your macro feed",
        body: "Every story that moves markets, ranked by impact. Click one to start.",
      },
      {
        targetSelector: ".dm-tabs",
        title: "Go deeper",
        body: "L1 is what happened. L4 is what to trade. The edge is always deeper than the headline.",
      },
      {
        targetSelector: "#edgeList",
        title: "Edge scores",
        body: "How much of this story is still unpriced? Higher = the market hasn't caught up yet. That's your window.",
      },
      {
        targetSelector: "#openModalSide",
        title: "Make it yours",
        body: "Add what's in your book. Every story gets filtered through your positions — so you only see what matters to you.",
        cta: { label: "Add my first holding →", action: onOpenAddHolding },
      },
    ],
    [onOpenAddHolding],
  );

  useEffect(() => {
    if (tourCompleted) return;
    // Only start once all dashboard targets exist, then delay for paint.
    let alive = true;
    let tries = 0;
    const tick = () => {
      tries += 1;
      const feedEl = document.querySelector(".main");
      const tabsEl = document.querySelector(".dm-tabs");
      const edgeEl = document.querySelector("#edgeList");
      const addBtn = document.querySelector("#openModalSide");
      if (feedEl && tabsEl && edgeEl && addBtn) {
        window.setTimeout(() => {
          if (!alive) return;
          setReady(true);
          setVisible(true);
        }, 800);
        return;
      }
      // Stop after ~6s to avoid endless polling.
      if (tries < 60) window.setTimeout(tick, 100);
    };
    tick();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!visible || !ready) return;
    const step = steps[idx];
    const measure = () => {
      const el = document.querySelector(step.targetSelector) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect(r);

      // Tooltip positioning relative to target + screen region.
      const w = window.innerWidth;
      const h = window.innerHeight;
      const tipW = 340;
      const tipH = 190;
      const midX = r.left + r.width / 2;
      const region = midX < w * 0.33 ? "left" : midX > w * 0.66 ? "right" : "center";

      let left = 12;
      let top = 12;
      if (region === "left") {
        left = r.right + 12;
        top = r.top;
      } else if (region === "right") {
        left = r.left - 12 - tipW;
        top = r.top;
      } else {
        left = r.left;
        top = r.bottom + 12;
      }
      left = Math.max(12, Math.min(left, w - tipW - 12));
      top = Math.max(12, Math.min(top, h - tipH - 12));
      setTipPos({ left, top });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [visible, ready, idx, steps]);

  const completeTour = () => {
    tourCompleted = true;
    setVisible(false);
  };

  if (tourCompleted) return null;
  if (!ready || !visible) return null;

  const step = steps[idx];
  const pad = 8;
  const r = rect
    ? {
        left: Math.max(8, rect.left - pad),
        top: Math.max(8, rect.top - pad),
        width: Math.min(window.innerWidth - 16, rect.width + pad * 2),
        height: Math.min(window.innerHeight - 16, rect.height + pad * 2),
      }
    : null;

  return (
    <div className="d4-tour" role="dialog" aria-modal="true">
      {r && (
        <div
          className="d4-tour-cutout"
          style={{
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
          }}
        />
      )}
      <div className="d4-tour-card" style={{ left: tipPos.left, top: tipPos.top }}>
        <div className="d4-tour-kicker">
          Step {idx + 1} / {steps.length}
        </div>
        <div className="d4-tour-title">{step.title}</div>
        <div className="d4-tour-body">{step.body}</div>
        <div className="d4-tour-actions">
          <button type="button" className="d4-tour-skip" onClick={completeTour}>
            Skip tour
          </button>
          <span style={{ flex: 1 }} />
          {step.cta && (
            <button
              type="button"
              className="d4-tour-cta"
              onClick={() => {
                step.cta?.action();
                completeTour();
              }}
            >
              {step.cta.label}
            </button>
          )}
          {!step.cta && (
            <button
              type="button"
              className="d4-tour-next"
              onClick={() => {
                if (idx >= steps.length - 1) completeTour();
                else setIdx((v) => v + 1);
              }}
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

