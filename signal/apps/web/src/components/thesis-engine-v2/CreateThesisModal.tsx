"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { InsiderFlowSetupFields, type InsiderFlowFieldKey } from "@/components/thesis-engine-v2/InsiderFlowSetupFields";

type FormState = {
  mode: "choice" | "ai" | "review" | "manual";
  aiPrompt: string;
  title: string;
  asset: string;
  direction: "long" | "short";
  whyNow: string;
  whatsUnpriced: string;
  entrySetup: string;
  stop: string;
  target: string;
  thesisStatement: string;
  horizon: string;
  probability: string; // percent string
  // Scenario fields
  baseProb: string;
  baseConfirms: string;
  baseConsequence: string;
  bullProb: string;
  bullConfirms: string;
  bullConsequence: string;
  bearProb: string;
  bearConfirms: string;
  bearConsequence: string;

  // Insider Flow setup (optional)
  bullInstruments: string;
  bearInstruments: string;
  confirmTags: string;
  contradictTags: string;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72);
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function scoreFromProb(p: number) {
  // Heuristic: higher conviction tends to imply stronger driver + clearer trade.
  const driverStrength = clamp(Math.round((p / 100) * 18), 6, 20);
  const timeCompression = clamp(Math.round((p / 100) * 22), 6, 25);
  const marketMispricingScore = clamp(Math.round((p / 100) * 22), 6, 25);
  const tradeClarityScore = clamp(Math.round((p / 100) * 14), 4, 15);
  const triggerClarityScore = clamp(Math.round((p / 100) * 14), 4, 15);
  const total = clamp(
    driverStrength + timeCompression + marketMispricingScore + tradeClarityScore + triggerClarityScore,
    0,
    100,
  );
  const qualification = total >= 65 ? "tradeable" : total >= 40 ? "emerging" : "theme";
  return { driverStrength, timeCompression, marketMispricingScore, tradeClarityScore, triggerClarityScore, total, qualification } as const;
}

function buildUserThesis(form: FormState): Thesis {
  const p = clamp(Number.parseInt(form.probability || "0", 10) || 0, 0, 100);
  const s = scoreFromProb(p);
  const title = form.title.trim();
  const baseSlug = slugify(title || "user-thesis");
  const nowId = `user-${Date.now().toString(36)}`;
  const asset = form.asset.trim().toUpperCase();

  const tradeLine = form.entrySetup || form.stop || form.target
    ? `Entry ${form.entrySetup || "—"} · Stop ${form.stop || "—"} · Target ${form.target || "—"}`
    : "Optional setup pending — define entry/stop/targets when trigger compresses.";
  const tradeProse =
    form.entrySetup || form.stop || form.target
      ? "Express the view using the levels in Trade plan once the gate in Trigger is observable; adjust sizing as evidence updates — keep numbers out of this sentence."
      : "Optional setup pending — define levels in Trade plan when trigger compresses.";

  return {
    id: nowId,
    slug: `${baseSlug}-${nowId.slice(-4)}`,
    title: title || "Untitled thesis",
    thesisStatement: form.thesisStatement.trim(),
    asset: asset || "—",
    direction: form.direction,
    probability: p || 50,
    status: p >= 65 ? "ready" : p >= 50 ? "active" : "watching",
    probabilityRationale:
      "Starting conviction reflects your framing. DEPTH4 will update probability as signals confirm or break the trigger.",
    origin: "user",

    hiddenDriver: "You named the main driver in your draft; incoming headlines will test whether it still holds.",
    likelyPath: "Evidence stacks → the trigger gets obvious → price catches up → you either take targets or hit invalidation.",
    marketMisread: "",
    tradeExpression: `Straight read: ${asset || "asset"} — ${tradeLine}`,

    whyNow: form.whyNow.trim(),
    whatsUnpriced: form.whatsUnpriced.trim(),
    trigger: form.entrySetup.trim(),
    trade: tradeProse,
    invalidation: form.bearConfirms.trim(),
    horizon: form.horizon.trim(),
    advisoryAction: p >= 65 ? "enter" : p >= 50 ? "hold" : "watch",
    lastUpdated: "Just now",

    qualification: s.qualification,
    scores: {
      driverStrength: s.driverStrength,
      timeCompression: s.timeCompression,
      marketMispricingScore: s.marketMispricingScore,
      tradeClarityScore: s.tradeClarityScore,
      triggerClarityScore: s.triggerClarityScore,
      total: s.total,
    },
    theme: "user",

    entryZone: form.entrySetup.trim() || undefined,
    stop: form.stop.trim() || undefined,
    target1: form.target.trim() || undefined,
    target2: undefined,

    scenarioOverrides: {
      base: {
        probability: clamp(Number.parseInt(form.baseProb || "0", 10) || 0, 0, 100),
        confirmation: form.baseConfirms.trim(),
        marketConsequence: form.baseConsequence.trim(),
      },
      bull: {
        probability: clamp(Number.parseInt(form.bullProb || "0", 10) || 0, 0, 100),
        confirmation: form.bullConfirms.trim(),
        marketConsequence: form.bullConsequence.trim(),
      },
      bear: {
        probability: clamp(Number.parseInt(form.bearProb || "0", 10) || 0, 0, 100),
        confirmation: form.bearConfirms.trim(),
        marketConsequence: form.bearConsequence.trim(),
      },
    },

    insiderFlow: {
      bullInstruments: form.bullInstruments
        .split(",")
        .map((s2) => s2.trim())
        .filter(Boolean),
      bearInstruments: form.bearInstruments
        .split(",")
        .map((s2) => s2.trim())
        .filter(Boolean),
      confirmTags: form.confirmTags
        .split(",")
        .map((s2) => s2.trim())
        .filter(Boolean),
      contradictTags: form.contradictTags
        .split(",")
        .map((s2) => s2.trim())
        .filter(Boolean),
    },
  };
}

function generateDraftFromPrompt(prompt: string): Pick<
  FormState,
  | "title"
  | "asset"
  | "direction"
  | "whyNow"
  | "whatsUnpriced"
  | "entrySetup"
  | "stop"
  | "target"
  | "thesisStatement"
  | "probability"
  | "horizon"
  | "baseProb"
  | "baseConfirms"
  | "baseConsequence"
  | "bullProb"
  | "bullConfirms"
  | "bullConsequence"
  | "bearProb"
  | "bearConfirms"
  | "bearConsequence"
  | "bullInstruments"
  | "bearInstruments"
  | "confirmTags"
  | "contradictTags"
> {
  const p = prompt.trim();
  const low = p.toLowerCase();

  const explicitLong =
    /\blong\b|\bbull\b|\bbullish\b|\brally\b|\bskyrocket\b|\bmoon\b|\bsurge\b|\brebound\b|\bbounce\b|\brerate\b/i.test(
      low,
    );
  const explicitShort =
    /\bshort\b|\bbear\b|\bbearish\b|\bcrash\b|\bplunge\b|\bweaken\b|\bfade\b|\bdownside\b|\brace\b/i.test(low);
  const direction: "long" | "short" = explicitShort && !explicitLong ? "short" : "long";

  let asset = "—";
  if (/\bbtc\b|bitcoin\b/i.test(p)) asset = "BTC";
  else if (/\beth\b|ethereum\b/i.test(p)) asset = "ETH";
  else if (/\bxau\b|\bgold\b/i.test(p)) asset = "XAUUSD";
  else if (/\bwti\b|\bbrent\b|\boil\b/i.test(p)) asset = "WTI";
  else {
    const assetMatch = p.match(/\b([A-Z]{2,6}(?:USD)?)\b/);
    if (assetMatch?.[1]) asset = assetMatch[1].toUpperCase();
  }

  const clarityAct = /\bclarity\s+act\b|\bcrypto\s+clarity\b|\bgenius\s+act\b/i.test(p);
  const regulation = /\bregulation\b|\blegislation\b|\bbill\b|\bsec\b|\bcustody\b|\betf\b|\bstatute\b/i.test(low);
  const ceasefireGeo = /\bceasefire\b|\bpeace\b|\btalks\b/i.test(p);
  const fedMacro = /\bfed\b|\bpivot\b|\brates\b|\bcpi\b/i.test(p);
  const oilTheme = /\bopec\b|\bbrent\b|\bwti\b|\boil\b/i.test(p);

  const firstClause = p.length ? p.split(/[.!?]/)[0]!.trim() : "";
  const title =
    asset === "BTC" && clarityAct
      ? "BTC rerating risk if US crypto clarity legislation lands clean"
      : asset !== "—" && firstClause
        ? `${asset}: ${firstClause.slice(0, 56)}`.slice(0, 72)
        : firstClause
          ? firstClause.slice(0, 72)
          : "Untitled thesis";

  const thesisStatement =
    asset === "BTC" && clarityAct
      ? "Long BTC: workable statutory clarity plus follow-on rulemaking should pull institutional pipes and ETF balances forward faster than spot implies — especially if flows confirm after passage."
      : direction === "long"
        ? `Long ${asset !== "—" ? asset : "the expression"}: ${firstClause || p}`.slice(0, 520)
        : `Short ${asset !== "—" ? asset : "the expression"}: ${firstClause || p}`.slice(0, 520);

  const whyNow =
    asset === "BTC" && clarityAct
      ? "Congressional calendars and drafting leaks are live — BTC reprices headline risk around passage and implementation timing now, not as a distant hypothetical."
      : regulation
        ? "Policy calendars and headline risk are moving — the catalyst stack matters this quarter, not abstractly."
        : ceasefireGeo
          ? "Talk-track and battlefield headlines are shifting weekly — positioning resets faster than many hedges assume."
          : fedMacro
            ? "Prints and Fed guidance are in motion — the window where markets repriced stale assumptions is open."
            : `The driver you named is showing up in headlines or positioning — the tape is reacting now rather than drifting.`;


  const whatsUnpriced =
    asset === "BTC" && clarityAct
      ? "Spot anchors on signing theater; it tends to misprice how quickly custody, stablecoin rails, and advisor mandates refill once rule text is actionable."
      : regulation
        ? "Consensus tracks the vote; second-order enablement speed and flow absorption through compliant venues are usually under-modeled."
        : `Price reflects the obvious narrative — the missing piece is how ${asset !== "—" ? asset : "risk"} reprices second-order flows once the catalyst proves durable.`;

  const entrySetup =
    asset === "BTC" && clarityAct
      ? "Wait for credible statutory language plus at least two weeks of confirming ETF net flows or rising regulated balances — only size up after flows validate the policy handoff, not a one-day headline spike."
      : `Act only after your catalyst shows up in observable evidence — use continuation or a clean retest once ${asset !== "—" ? asset : "price"} and the trigger align.`;

  const stop =
    asset === "BTC" && clarityAct
      ? "Stand down if passage stalls or dilutes past credible timelines, if enforcement shocks break venue trust, or if BTC refuses higher flows after constructive headlines — those break the legislative-to-flows bridge."
      : `Exit if the catalyst fails or ${asset !== "—" ? asset : "the tape"} prints your invalidation — don’t rationalize a broken setup.`;

  const target =
    asset === "BTC" && clarityAct
      ? "Scale toward sustained flow pulses and compressed realized vol — trail risk once balances and volumes prove the thesis through positioning, not sentiment chop."
      : `Take profits in steps toward the scenario your thesis implies — tighten risk once ${asset !== "—" ? asset : "markets"} confirm via flows or levels.`;

  const horizon =
    asset === "BTC" && clarityAct ? "6–18 months" : regulation ? "3–12 months" : oilTheme ? "4–16 weeks" : "2–8 weeks";

  const probability = String(52 + (p.length % 7));

  const baseConfirms =
    asset === "BTC" && clarityAct
      ? "Law lands but implementation chops — desks onboard slowly, headlines alternate between euphoria and skepticism, and BTC grinds with frequent resets."
      : `Messy path: your driver still matters but cross-currents keep ${asset !== "—" ? asset : "the tape"} two-way.`;

  const baseConsequence =
    asset === "BTC" && clarityAct
      ? "Run a smaller core, wider buffers — add only when flows and volumes prove pipes are filling."
      : `Keep size modest; lean on your risk lines until ${asset !== "—" ? asset : "price"} picks a cleaner trend.`;

  const bullConfirms =
    asset === "BTC" && clarityAct
      ? "Clean rulebook accelerates ETF and treasury pipelines; transfer volumes step-change and regulated balances rise together."
      : `Clean win: the trigger clears with stacked confirming data — ${asset !== "—" ? asset : "expression"} tracks your thesis on schedule.`;

  const bullConsequence =
    asset === "BTC" && clarityAct
      ? "Payoff arrives faster — scale methodically as flows compound while trailing invalidation levels."
      : `Let winners run along your plan — add only while invalidation stays untouched.`;

  const bearConfirms =
    asset === "BTC" && clarityAct
      ? "Bill stalls, language is watered down, or macro risk-off swallows the micro catalyst before flows inflect."
      : `Broken thesis: your invalidation prints — facts or positioning show the read is wrong.`;

  const bearConsequence =
    asset === "BTC" && clarityAct
      ? "Retire the squeeze framing — cut before averaging into a narrative that lost its mechanism."
      : `Cut or exit per your book — don’t rebuild size into a disproved story.`;

  const tags: string[] = [];
  const contradict: string[] = [];
  if (ceasefireGeo) {
    tags.push("ceasefire", "peace talks");
    contradict.push("strikes", "escalation", "talks collapse");
  }
  if (fedMacro) {
    tags.push("Fed pivot", "rates guidance");
    contradict.push("sticky inflation", "hawkish hold", "higher for longer");
  }
  if (oilTheme) {
    tags.push("OPEC cuts", "oil balances");
    contradict.push("output increase", "demand slowdown");
  }
  if (asset === "BTC" && clarityAct) {
    tags.push("regulatory clarity", "ETF flows", "custody rulemaking", "final passage");
    contradict.push("bill stalls", "SEC enforcement surge", "risk-off", "diluted language");
  } else if (regulation && asset === "BTC") {
    tags.push("regulatory headlines", "ETF flows");
    contradict.push("enforcement shock", "risk-off");
  }
  if (/\btrade deal\b|\btariff\b/i.test(p)) tags.push("trade deal");

  const bullIns: string[] = [];
  const bearIns: string[] = [];
  if (/\bgold\b|\bxau\b/i.test(p)) bearIns.push("XAUUSD");
  if (/\boil\b|\bwti\b|\bbrent\b/i.test(p)) bearIns.push("WTI");
  if (/\bdefen[cs]e\b|\bita\b/i.test(p)) bearIns.push("ITA");
  if (/\bbtc\b|bitcoin\b/i.test(p)) bullIns.push("BTC");
  if (asset === "BTC" && clarityAct) bullIns.push("COIN");
  if (/\btlt\b/i.test(p)) bullIns.push("TLT");

  const confirmTags =
    tags.length > 0
      ? Array.from(new Set(tags)).join(", ")
      : regulation
        ? "policy headlines, implementation timing"
        : "catalyst confirmation, flow shift";

  const contradictTags =
    contradict.length > 0
      ? Array.from(new Set(contradict)).join(", ")
      : regulation
        ? "enforcement shock, headline reversal"
        : "invalidation print, macro flip";

  return {
    title: title || "Untitled thesis",
    asset,
    direction,
    whyNow,
    whatsUnpriced,
    entrySetup,
    stop,
    target,
    thesisStatement: p.length ? thesisStatement : "Add your thesis idea to draft against.",
    probability,
    horizon,
    baseProb: "38",
    baseConfirms,
    baseConsequence,
    bullProb: "37",
    bullConfirms,
    bullConsequence,
    bearProb: "25",
    bearConfirms,
    bearConsequence,
    bullInstruments: bullIns.length ? bullIns.join(", ") : asset === "BTC" ? "BTC" : "—",
    bearInstruments: bearIns.join(", "),
    confirmTags,
    contradictTags,
  };
}

type AiDraftFormPatch = Pick<
  FormState,
  | "title"
  | "asset"
  | "direction"
  | "whyNow"
  | "whatsUnpriced"
  | "entrySetup"
  | "stop"
  | "target"
  | "thesisStatement"
  | "probability"
  | "horizon"
  | "baseProb"
  | "baseConfirms"
  | "baseConsequence"
  | "bullProb"
  | "bullConfirms"
  | "bullConsequence"
  | "bearProb"
  | "bearConfirms"
  | "bearConsequence"
  | "bullInstruments"
  | "bearInstruments"
  | "confirmTags"
  | "contradictTags"
>;

function scenBlock(o: unknown): { probability: number; confirms: string; consequence: string } {
  if (!o || typeof o !== "object") return { probability: 33, confirms: "", consequence: "" };
  const r = o as Record<string, unknown>;
  const pr = typeof r.probability === "number" ? r.probability : Number.parseInt(String(r.probability ?? "0"), 10) || 33;
  return {
    probability: clamp(Math.round(pr), 0, 100),
    confirms: typeof r.confirms === "string" ? r.confirms : "",
    consequence: typeof r.consequence === "string" ? r.consequence : "",
  };
}

function joinListField(x: unknown): string {
  if (!Array.isArray(x)) return "";
  return x.map((v) => String(v).trim()).filter(Boolean).join(", ");
}

/** Maps POST /api/user/thesis-draft-expand `draft` JSON into modal form fields. */
function draftFromApiResponse(d: Record<string, unknown>): AiDraftFormPatch {
  const dir: "long" | "short" = d.direction === "short" ? "short" : "long";
  const sb = scenBlock(d.scenario_base);
  const bu = scenBlock(d.scenario_bull);
  const be = scenBlock(d.scenario_bear);
  const inf =
    d.insider_flow && typeof d.insider_flow === "object" ? (d.insider_flow as Record<string, unknown>) : {};
  const ppRaw =
    typeof d.probability_percent === "number"
      ? d.probability_percent
      : Number.parseInt(String(d.probability_percent ?? "55"), 10) || 55;
  const pp = clamp(Math.round(ppRaw), 1, 95);

  return {
    title: String(d.title ?? "").trim() || "Untitled thesis",
    asset: String(d.asset ?? "").trim().toUpperCase() || "—",
    direction: dir,
    thesisStatement: String(d.thesis_statement ?? "").trim(),
    whyNow: String(d.why_now ?? "").trim(),
    whatsUnpriced: String(d.whats_unpriced ?? "").trim(),
    entrySetup: String(d.trigger_entry_setup ?? "").trim(),
    stop: String(d.stop ?? "").trim(),
    target: String(d.target ?? "").trim(),
    horizon: String(d.horizon ?? "").trim() || "2–8 weeks",
    probability: String(pp),
    baseProb: String(sb.probability),
    baseConfirms: sb.confirms,
    baseConsequence: sb.consequence,
    bullProb: String(bu.probability),
    bullConfirms: bu.confirms,
    bullConsequence: bu.consequence,
    bearProb: String(be.probability),
    bearConfirms: be.confirms,
    bearConsequence: be.consequence,
    bullInstruments: joinListField(inf.bull_instruments),
    bearInstruments: joinListField(inf.bear_instruments),
    confirmTags: joinListField(inf.confirm_tags),
    contradictTags: joinListField(inf.contradict_tags),
  };
}

export function CreateThesisModal({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (t: Thesis) => void;
}) {
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [reviewSource, setReviewSource] = useState<null | "api" | "local">(null);

  const initial: FormState = useMemo(
    () => ({
      mode: "choice",
      aiPrompt:
        "Peace talks reduce gold's war premium, but spot still reflects too much geopolitical risk.",
      title: "Gold will fall as a peace deal removes the war-risk premium the market has been paying within weeks",
      thesisStatement:
        "If geopolitics de-escalates, gold's war premium comes out faster than current positioning implies.",
      asset: "XAUUSD",
      direction: "short",
      whyNow: "Talk-track is shifting; optionality is still priced for escalation.",
      whatsUnpriced: "Spot still reflects too much tail-risk premium vs. the new information set.",
      entrySetup: "Enter on failed bounce / lower-high after de-escalation headline confirms.",
      stop: "Re-escalation signal or price reclaim invalidates the fade.",
      target: "Reprice toward pre-premium range / next support shelf.",
      horizon: "2–8 weeks",
      probability: "61",
      baseProb: "35",
      baseConfirms:
        "Talks keep progressing but GLD chops on mixed headlines — every inflation blip or rumor spike resets the tape while the broader drift still leans lower.",
      baseConsequence:
        "Same short thesis, uglier path: keep size smaller, lean on Trade plan risk lines, and wait for cleaner calendar proof.",
      bullProb: "40",
      bullConfirms:
        "Calm geopolitical weeks stack, ETF flows show funds trimming war hedges on GLD, and XAU bleeds the fear bid without a fresh kinetic shock.",
      bullConsequence:
        "The GLD / XAU short pays close to plan; scale toward Trade plan targets — still this fade, not a new punt.",
      bearProb: "25",
      bearConfirms:
        "A kinetic headline returns or spot holds above the invalidation you set in the book — the peace-fade read is wrong on timing or facts.",
      bearConsequence: "Follow Invalidation and retire or sharply cut the short per Book.",

      bullInstruments: "BTC, TLT",
      bearInstruments: "WTI, ITA",
      confirmTags: "ceasefire, peace talks",
      contradictTags: "strikes, escalation, talks collapse",
    }),
    [],
  );

  const [form, setForm] = useState<FormState>(initial);

  function set<K extends keyof FormState>(k: K, v: string) {
    setForm((cur) => ({ ...cur, [k]: v }));
  }

  const canSubmit =
    form.title.trim() &&
    form.asset.trim() &&
    form.thesisStatement.trim() &&
    form.whyNow.trim() &&
    form.whatsUnpriced.trim() &&
    form.entrySetup.trim() &&
    form.horizon.trim() &&
    form.baseConfirms.trim() &&
    form.baseConsequence.trim() &&
    form.bullConfirms.trim() &&
    form.bullConsequence.trim() &&
    form.bearConfirms.trim() &&
    form.bearConsequence.trim();

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setForm(initial);
          setAiErr(null);
          setAiBusy(false);
          setReviewSource(null);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/55" />
        <Dialog.Content
          className={cn(
            // NOTE: Keep this as a centered modal on all breakpoints so it’s always visibly distinct from the page.
            "fixed left-1/2 top-1/2 z-[9999] w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2",
            "bg-[#0c0c0e] ring-1 ring-white/[0.08]",
            "focus:outline-none",
          )}
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div>
              <Dialog.Title className="text-sm font-semibold text-zinc-100">Create new thesis</Dialog.Title>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Paste a thesis idea — DEPTH4 turns it into a full draft you can refine.
              </p>
            </div>
            <Dialog.Close
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="h-px w-full bg-white/[0.06]" aria-hidden />

          <div className="h-[calc(100dvh-132px)] overflow-y-auto px-5 py-4 sm:max-h-[70vh] sm:h-auto">
            {form.mode === "choice" ? (
              <div className="grid gap-3">
                <button
                  type="button"
                  className="rounded-none border border-amber-500/25 bg-amber-500/10 px-4 py-4 text-left ring-1 ring-amber-500/20 hover:bg-amber-500/15"
                  onClick={() => set("mode", "ai")}
                >
                  <p className="text-[12px] font-semibold text-amber-200">Write with AI</p>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Paste one sentence — DEPTH4 drafts asset, direction, why now, what&apos;s unpriced, resolution paths, and a
                    trade shell.
                  </p>
                </button>
                <button
                  type="button"
                  className="rounded-none border border-white/[0.08] bg-zinc-900/30 px-4 py-4 text-left ring-1 ring-white/[0.06] hover:bg-zinc-900/45"
                  onClick={() => {
                    setReviewSource(null);
                    set("mode", "manual");
                  }}
                >
                  <p className="text-[12px] font-semibold text-zinc-200">Start manually</p>
                  <p className="mt-1 text-[11px] text-zinc-500">Fill the structured fields yourself.</p>
                </button>
              </div>
            ) : null}

            {form.mode === "ai" ? (
              <div className="grid gap-3">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                  Paste your thesis idea
                </label>
                <textarea
                  value={form.aiPrompt}
                  onChange={(e) => set("aiPrompt", e.target.value)}
                  rows={6}
                  className="w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[14px] leading-relaxed text-zinc-200 placeholder:text-zinc-600"
                  placeholder="Example: Peace talks reduce gold's war premium, but spot still reflects too much geopolitical risk."
                />
                <p className="text-[11px] text-zinc-500">
                  Start with one sentence. DEPTH4 thinks it through first — edit anything that looks off.
                </p>
                {aiErr ? (
                  <p className="text-[11px] leading-relaxed text-amber-200/90">{aiErr}</p>
                ) : null}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="min-h-11 rounded-md bg-amber-500/15 px-4 py-2.5 text-[14px] font-semibold text-amber-200 ring-1 ring-amber-500/25 hover:bg-amber-500/20 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px] disabled:opacity-40"
                    onClick={() => {
                      void (async () => {
                        const raw = form.aiPrompt.trim();
                        if (!raw) return;
                        setAiErr(null);
                        setAiBusy(true);
                        try {
                          const res = await fetch("/api/user/thesis-draft-expand", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ idea: raw }),
                          });
                          const j = (await res.json().catch(() => null)) as {
                            ok?: boolean;
                            draft?: Record<string, unknown>;
                            meta?: { errors?: string[]; errors_after_repair?: string[] };
                            error?: string;
                          } | null;
                          if (!res.ok || !j) {
                            const fb = generateDraftFromPrompt(raw);
                            setForm((cur) => ({ ...cur, ...fb, mode: "review" }));
                            setReviewSource("local");
                            setAiErr(
                              j?.error === "api_proxy_misconfigured"
                                ? "Configure DEPTH4 API URL and ingest secret on the server for full AI drafts."
                                : null,
                            );
                            return;
                          }
                          if (j.ok === true && j.draft && typeof j.draft === "object") {
                            const patch = draftFromApiResponse(j.draft);
                            setReviewSource("api");
                            setAiErr(null);
                            setForm((cur) => ({ ...cur, ...patch, mode: "review" }));
                            return;
                          }
                          const fb = generateDraftFromPrompt(raw);
                          setForm((cur) => ({ ...cur, ...fb, mode: "review" }));
                          setReviewSource("local");
                          const hint =
                            j.meta?.errors_after_repair?.join(", ") ??
                            j.meta?.errors?.join(", ") ??
                            "validation_after_repair";
                          setAiErr(`Quality checks failed after repair (${hint}).`);
                        } catch {
                          const fb = generateDraftFromPrompt(form.aiPrompt.trim());
                          setForm((cur) => ({ ...cur, ...fb, mode: "review" }));
                          setReviewSource("local");
                          setAiErr(null);
                        } finally {
                          setAiBusy(false);
                        }
                      })();
                    }}
                    disabled={!form.aiPrompt.trim() || aiBusy}
                  >
                    {aiBusy ? "Drafting…" : "Draft thesis with DEPTH4"}
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-md px-4 py-2.5 text-[14px] font-medium text-zinc-400 hover:bg-zinc-900/60 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px] sm:text-zinc-500"
                    onClick={() => set("mode", "choice")}
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : null}

            {form.mode === "manual" || form.mode === "review" ? (
              <div className="grid gap-4">
                {form.mode === "review" && reviewSource === "api" ? (
                  <div className="rounded-none border border-white/[0.08] bg-zinc-900/35 px-3 py-2 text-[11px] leading-relaxed text-zinc-300 ring-1 ring-white/[0.05]">
                    DEPTH4 drafted this from your idea. Edit anything.
                  </div>
                ) : null}
                {form.mode === "review" && reviewSource === "local" ? (
                  <div className="rounded-none border border-amber-500/25 bg-amber-500/10 px-3 py-2 ring-1 ring-amber-500/15">
                    <p className="text-[11px] leading-relaxed text-amber-200/95">
                      AI draft service unavailable — showing a lightweight local draft. Review carefully.
                    </p>
                    {aiErr ? <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{aiErr}</p> : null}
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Thesis title</label>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                      We&apos;ll propose a short title from your idea.
                    </p>
                    <input
                      value={form.title}
                      onChange={(e) => set("title", e.target.value)}
                      className="mt-2 w-full rounded-lg bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 ring-1 ring-white/[0.06] sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Asset / ticker</label>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                      We&apos;ll suggest the main ticker or basket when we can infer it.
                    </p>
                    <input
                      value={form.asset}
                      onChange={(e) => set("asset", e.target.value)}
                      className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 font-mono text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Direction</label>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">Long or short — inferred from how you framed the trade.</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        className={cn(
                          "rounded-md px-3 py-2 text-[11px] font-semibold ring-1",
                          form.direction === "long"
                            ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25"
                            : "bg-zinc-900/30 text-zinc-300 ring-white/[0.06] hover:bg-zinc-900/45",
                        )}
                        onClick={() => set("direction", "long")}
                      >
                        Long
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "rounded-md px-3 py-2 text-[11px] font-semibold ring-1",
                          form.direction === "short"
                            ? "bg-red-500/15 text-red-200 ring-red-500/25"
                            : "bg-zinc-900/30 text-zinc-300 ring-white/[0.06] hover:bg-zinc-900/45",
                        )}
                        onClick={() => set("direction", "short")}
                      >
                        Short
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Why now</label>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">What changed to make this thesis live now.</p>
                    <textarea
                      value={form.whyNow}
                      onChange={(e) => set("whyNow", e.target.value)}
                      rows={2}
                      className="mt-2 w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">What&apos;s unpriced</label>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                      The part of the story the market still seems to be missing.
                    </p>
                    <textarea
                      value={form.whatsUnpriced}
                      onChange={(e) => set("whatsUnpriced", e.target.value)}
                      rows={2}
                      className="mt-2 w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Entry setup</label>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">What you want to see before acting.</p>
                    <textarea
                      value={form.entrySetup}
                      onChange={(e) => set("entrySetup", e.target.value)}
                      rows={2}
                      className="mt-2 w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Stop</label>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">What would prove this trade expression wrong.</p>
                    <input
                      value={form.stop}
                      onChange={(e) => set("stop", e.target.value)}
                      className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Target</label>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">What &apos;right enough&apos; looks like.</p>
                    <input
                      value={form.target}
                      onChange={(e) => set("target", e.target.value)}
                      className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                      Thesis statement (plain English)
                    </label>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                      The sharpened investment claim — not the same line repeated across fields.
                    </p>
                    <textarea
                      value={form.thesisStatement}
                      onChange={(e) => set("thesisStatement", e.target.value)}
                      rows={3}
                      className="mt-2 w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Starting probability</label>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">A plausible opening conviction — adjust after you review.</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={form.probability}
                        onChange={(e) => set("probability", e.target.value)}
                        className="w-28 rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                        inputMode="numeric"
                      />
                      <span className="text-[11px] text-zinc-500">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Time horizon</label>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">How long this thesis should reasonably take to prove or break.</p>
                    <input
                      value={form.horizon}
                      onChange={(e) => set("horizon", e.target.value)}
                      className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>
                </div>

                <div className="h-px w-full bg-white/[0.06]" aria-hidden />

                <div className="grid gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Resolution paths</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                      Three ways this thesis can actually play out — not three separate trades. Probabilities should sum to about 100%.
                    </p>
                  </div>

                  <div className="grid gap-3 rounded-none border border-white/[0.06] bg-zinc-900/20 p-3">
                    <p className="text-[11px] font-semibold text-zinc-200">Messy win</p>
                    <p className="text-[10px] leading-snug text-zinc-600">Direction roughly right; payoff slower, smaller, or choppier.</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={form.baseProb}
                        onChange={(e) => set("baseProb", e.target.value)}
                        className="rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        inputMode="numeric"
                        placeholder="Probability %"
                      />
                      <textarea
                        value={form.baseConfirms}
                        onChange={(e) => set("baseConfirms", e.target.value)}
                        className="sm:col-span-2 resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        rows={2}
                        placeholder="What happens"
                      />
                      <textarea
                        value={form.baseConsequence}
                        onChange={(e) => set("baseConsequence", e.target.value)}
                        className="sm:col-span-3 resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        rows={2}
                        placeholder="What it means for the trade"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-none border border-white/[0.06] bg-zinc-900/20 p-3">
                    <p className="text-[11px] font-semibold text-zinc-200">Clean win</p>
                    <p className="text-[10px] leading-snug text-zinc-600">Thesis basically correct; pays close to how you framed it.</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={form.bullProb}
                        onChange={(e) => set("bullProb", e.target.value)}
                        className="rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        inputMode="numeric"
                        placeholder="Probability %"
                      />
                      <textarea
                        value={form.bullConfirms}
                        onChange={(e) => set("bullConfirms", e.target.value)}
                        className="sm:col-span-2 resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        rows={2}
                        placeholder="What happens"
                      />
                      <textarea
                        value={form.bullConsequence}
                        onChange={(e) => set("bullConsequence", e.target.value)}
                        className="sm:col-span-3 resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        rows={2}
                        placeholder="What it means for the trade"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-none border border-white/[0.06] bg-zinc-900/20 p-3">
                    <p className="text-[11px] font-semibold text-zinc-200">Thesis broken</p>
                    <p className="text-[10px] leading-snug text-zinc-600">Invalidated — retire or cut per Invalidation / Book.</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={form.bearProb}
                        onChange={(e) => set("bearProb", e.target.value)}
                        className="rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        inputMode="numeric"
                        placeholder="Probability %"
                      />
                      <textarea
                        value={form.bearConfirms}
                        onChange={(e) => set("bearConfirms", e.target.value)}
                        className="sm:col-span-2 resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        rows={2}
                        placeholder="What happens"
                      />
                      <textarea
                        value={form.bearConsequence}
                        onChange={(e) => set("bearConsequence", e.target.value)}
                        className="sm:col-span-3 resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        rows={2}
                        placeholder="What it means for the trade"
                      />
                    </div>
                  </div>
                </div>

                <div className="h-px w-full bg-white/[0.06]" aria-hidden />

                <InsiderFlowSetupFields
                  bullInstruments={form.bullInstruments}
                  bearInstruments={form.bearInstruments}
                  confirmTags={form.confirmTags}
                  contradictTags={form.contradictTags}
                  onChange={(key: InsiderFlowFieldKey, value: string) => set(key, value)}
                  largeTouch
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4">
            <p className="text-[11px] text-zinc-500">
              DEPTH4 watches your trigger and logs how conviction shifts as headlines and flows arrive.
            </p>
            <div className="flex items-center gap-2">
              <Dialog.Close className="min-h-11 rounded-md px-4 py-2.5 text-[14px] font-medium text-zinc-400 hover:bg-zinc-900/60 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px] sm:text-zinc-500">
                Cancel
              </Dialog.Close>
              <button
                type="button"
                className={cn(
                  "min-h-11 rounded-md px-4 py-2.5 text-[14px] font-semibold sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px]",
                  canSubmit
                    ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25 hover:bg-amber-500/20"
                    : "bg-zinc-900/40 text-zinc-600 ring-1 ring-white/[0.06] cursor-not-allowed",
                )}
                disabled={!canSubmit}
                onClick={() => {
                  if (!canSubmit) return;
                  const thesis = buildUserThesis(form);
                  onCreate(thesis);
                  onOpenChange(false);
                  setForm(initial);
                }}
              >
                Create thesis
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

