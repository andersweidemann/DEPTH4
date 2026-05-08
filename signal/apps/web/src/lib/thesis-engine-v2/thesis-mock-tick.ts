import type { ThesisAlertImpact } from "@/lib/thesis-engine-v2/thesis-alert-types";
import { mergeThesis, clamp } from "@/lib/thesis-engine-v2/thesis-merge";
import type { LiveSignalTickerItem, Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";

export type Overrides = Record<string, Partial<Thesis>>;

function randomPick<T>(arr: T[], random: () => number): T {
  return arr[Math.floor(random() * arr.length)]!;
}

function stanceLabelForImpact(a: Thesis["advisoryAction"]): string {
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

export type MockThesisTickResult = {
  thesisId: string;
  patch: Partial<Thesis>;
  pulseThesisId: string;
  scenario?: {
    base: number;
    bull: number;
    bear: number;
    lead: "base" | "bull" | "bear";
  };
  scenarioDelta?: {
    scenario: "base" | "bull" | "bear";
    oldProbability: number;
    newProbability: number;
    confirmText: string;
    consequenceText: string;
  };
  alert?: {
    thesisId: string;
    thesisTitle: string;
    body: string;
    impact: ThesisAlertImpact;
  };
  toastMessage?: string;
  tickerItem?: LiveSignalTickerItem;
};

export function runMockThesisTick(args: {
  mockTheses: Thesis[];
  overrides: Overrides;
  hasManualOutcome: (thesisId: string) => boolean;
  /** Starred or open-book — only these clients get push alerts / toasts from the tick. */
  isSubscribed: (thesisId: string) => boolean;
  random: () => number;
}): MockThesisTickResult | null {
  const { mockTheses, overrides, hasManualOutcome, isSubscribed, random } = args;

  const pool = mockTheses.filter((t) => {
    if (hasManualOutcome(t.id)) return false;
    const cur = mergeThesis(t, overrides[t.id]);
    return cur.status !== "resolved" && cur.status !== "invalidated";
  });
  if (!pool.length) return null;

  const base = randomPick(pool, random);
  const prev = mergeThesis(base, overrides[base.id]);
  const roll = random();
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
    const d = Math.floor(random() * 7) + 4;
    const sign = random() < 0.55 ? 1 : -1;
    patch = { probability: clamp(prev.probability + sign * d, 18, 92) };
  } else if (roll < 0.34) {
    const parts = { ...prev.scores };
    const k = randomPick(["driverStrength", "timeCompression", "marketMispricingScore"] as const, random);
    const bump = random() < 0.5 ? 1 : 2;
    parts[k] = clamp(parts[k] + bump, 0, k === "driverStrength" ? 20 : 25);
    patch = { scores: parts };
  } else {
    const d = Math.floor(random() * 3) + 1;
    const sign = random() < 0.5 ? 1 : -1;
    patch = { probability: clamp(prev.probability + sign * d, 18, 92) };
  }

  if (roll > 0.92 && !invalidated) {
    majorSignal = true;
  }

  const next = mergeThesis(prev, patch);
  const probDelta = next.probability - prev.probability;

  // Scenario distribution (demo): derived from conviction with a bit of noise.
  // This powers the notification center and can later be replaced by a real scenario model.
  const noise = () => Math.floor((random() - 0.5) * 7); // ~[-3..+3]
  let bull = clamp(Math.round(next.probability * 0.55) + noise(), 10, 75);
  let bear = clamp(Math.round((100 - next.probability) * 0.45) + noise(), 5, 70);
  let baseCase = 100 - bull - bear;
  if (baseCase < 10) {
    const take = 10 - baseCase;
    const takeBull = Math.min(take, Math.max(0, bull - 10));
    bull -= takeBull;
    bear -= Math.max(0, take - takeBull);
    baseCase = 100 - bull - bear;
  }
  if (baseCase > 80) {
    const spill = baseCase - 80;
    bull += Math.floor(spill / 2);
    bear += spill - Math.floor(spill / 2);
    baseCase = 100 - bull - bear;
  }

  const scenario = { base: baseCase, bull, bear } as const;
  const lead = (["base", "bull", "bear"] as const).reduce((best, k) => (scenario[k] > scenario[best] ? k : best), "base");

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

  const notifyProb = Math.abs(probDelta) >= 5;
  const shouldNotifyContent = statusChanged || invalidated || notifyProb || majorSignal;
  const eff = isSubscribed(base.id);

  let alert: MockThesisTickResult["alert"];
  if (eff && shouldNotifyContent) {
    const body = [
      `${prev.title}`,
      thesisAwareLine,
      `Thesis impact: ${impact === "invalidated" ? "Invalidated" : impact.replace(/_/g, " ")}.`,
      `Probability: ${prev.probability}% → ${next.probability}%.`,
      `Stance: ${stanceLabelForImpact(next.advisoryAction)}`,
    ].join("\n");
    alert = {
      thesisId: base.id,
      thesisTitle: prev.title,
      body,
      impact,
    };
  }

  let toastMessage: string | undefined;
  if (eff && (notifyProb || invalidated || (statusChanged && next.status === "ready"))) {
    toastMessage =
      invalidated || (statusChanged && next.status === "ready")
        ? `DEPTH4 Alert: ${prev.title} — ${invalidated ? "Invalidated." : "Now Ready. Entry setup valid."} Probability: ${next.probability}%.`
        : `DEPTH4 Alert: ${prev.title} — Probability moved materially (${prev.probability}% → ${next.probability}%).`;
  }

  let tickerItem: LiveSignalTickerItem | undefined;
  if (majorSignal && !invalidated) {
    tickerItem = {
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
  }

  return {
    thesisId: base.id,
    patch,
    pulseThesisId: base.id,
    scenario: { ...scenario, lead },
    alert,
    toastMessage,
    tickerItem,
  };
}
