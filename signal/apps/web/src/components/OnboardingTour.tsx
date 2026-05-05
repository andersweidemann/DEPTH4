"use client";

import { useEffect, useMemo, useState } from "react";

type TourStep = {
  targetSelector: string;
  title: string;
  body: string;
  cta?: { label: string; action: () => void };
};

let tourSeenThisSession = false;

export function OnboardingTour({ onOpenAddHolding }: { onOpenAddHolding: () => void }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const steps: TourStep[] = useMemo(
    () => [
      {
        targetSelector: ".d4-main",
        title: "Your live macro feed",
        body: "Stories are ranked by market impact. Click any card to start your analysis.",
      },
      {
        targetSelector: ".d4-dm-tabs",
        title: "Go deeper with every click",
        body: "L1 = what happened. L2 = who else is affected. L3 = what could happen next. L4 = what to do and when.",
      },
      {
        targetSelector: "#edgeList",
        title: "Your edge scores",
        body: "Higher score = more uncaptured upside for this story. These update live.",
      },
      {
        targetSelector: "#openModalSide",
        title: "Make it personal",
        body: "Add your holdings to see exactly how each story affects your book.",
        cta: { label: "Add my first holding →", action: onOpenAddHolding },
      },
    ],
    [onOpenAddHolding],
  );

  useEffect(() => {
    if (tourSeenThisSession) return;
    tourSeenThisSession = true;
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const step = steps[idx];
    const measure = () => {
      const el = document.querySelector(step.targetSelector) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      setRect(el.getBoundingClientRect());
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, idx, steps]);

  if (!open) return null;

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

  const tipLeft = r ? Math.min(window.innerWidth - 360, Math.max(12, r.left)) : 12;
  const tipTop = r ? Math.min(window.innerHeight - 180, r.top + r.height + 10) : 12;

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
      <div className="d4-tour-card" style={{ left: tipLeft, top: tipTop }}>
        <div className="d4-tour-kicker">
          Step {idx + 1} / {steps.length}
        </div>
        <div className="d4-tour-title">{step.title}</div>
        <div className="d4-tour-body">{step.body}</div>
        <div className="d4-tour-actions">
          <button type="button" className="d4-tour-skip" onClick={() => setOpen(false)}>
            Skip tour
          </button>
          <span style={{ flex: 1 }} />
          {step.cta && (
            <button
              type="button"
              className="d4-tour-cta"
              onClick={() => {
                step.cta?.action();
                setOpen(false);
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
                if (idx >= steps.length - 1) setOpen(false);
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

