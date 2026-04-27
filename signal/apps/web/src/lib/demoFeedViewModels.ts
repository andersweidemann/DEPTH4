import type { FeedViewModel, FeedLayer3, FeedLayer4 } from "./feed-model";

const l3: FeedLayer3 = {
  scenarios: [
    {
      id: "A",
      label: "Scenario A",
      probability: 45,
      outcome: "Oman hosts a quiet channel restart; crude bid holds. Risk assets fade only briefly.",
      marketImpact: "Brent +$4–6 · S&P −0.8% · DXY +0.3%",
      winners: ["FCX", "VLO", "XLE"],
      losers: ["BKNG", "IAG", "DAL"],
      oneWatch: "Confirmed if: Oman FM tweets a joint readout with Araghchi (even vague).",
    },
    {
      id: "B",
      label: "Scenario B",
      probability: 35,
      outcome: "Talks stay frozen; energy premium stays, equities chop.",
      marketImpact: "Brent flat-to-up 2% · S&P flat · USD mixed",
      winners: ["XLE", "COP"],
      losers: ["DAL"],
      oneWatch: "If silence >48h, default to B until inventories print.",
    },
    {
      id: "C",
      label: "Scenario C (tail)",
      probability: 20,
      outcome: "Escalation path reprices defensives and short-cycle travel.",
      marketImpact: "Brent +$6–8 · S&P −1.2% · DXY +0.6%",
      winners: ["LMT", "ITA", "NOC"],
      losers: ["AAL", "CCL"],
      oneWatch: "If Gulf headlines reference facility damage, C gains weight.",
    },
  ],
  watchList: [
    { kind: "confirmA" as const, line: "Oman FM + Araghchi readout in same hour → A confirmed" },
    { kind: "activateC" as const, line: "Witkoff bails on region + Brent rips in Asia → C activated" },
    { kind: "wait" as const, line: "Nothing new from Muscat/Tehran 6h window → B default" },
  ],
};

const l4: FeedLayer4 = {
  isPersonalized: true,
  positions: [
    {
      position: "FCX",
      valueSek: "23,864",
      impactScenarioA: "+2,100 SEK (illustr.)",
      impactScenarioC: "+4,800 SEK (illustr.)",
      action: "HOLD ✅",
    },
    {
      position: "VLO",
      valueSek: "18,120",
      impactScenarioA: "+900 SEK (illustr.)",
      impactScenarioC: "−1,200 SEK (illustr.)",
      action: "HOLD, watch limit",
    },
  ],
  orders: [
    {
      summary: "VLO buy limit $220 (demo)",
      distanceLine: "~5.9% from mark (illustration)",
      scenarioA: {
        situation: "Brent down leg pulls refiners; price may approach the limit.",
        rec: "Keep the order if the thesis still holds; \"peace\" noise as entry is a common read here.",
      },
      scenarioC: {
        situation: "Crude leg up; VLO can gap away from $220.",
        rec: "Revisit if your own invalidation (e.g. Brent $108) tags first — illustration only.",
      },
    },
  ],
  watchlist: [
    { line: "NTR — add on a flush to $63 if Scenario A’s soft-landing holds (fertilizer bid)." },
    { line: "XLE — only as hedge on C, around $95 if vol spikes (illustration)." },
  ],
};

export const demoAraghchi: FeedViewModel = {
  id: "demo-1",
  source: "Reuters",
  signalLevel: 4,
  headline: "Araghchi leaves Islamabad without meeting US envoys",
  hook: "Not a collapse. Oman is the real next move. Talks are relocating, not dying.",
  affectedUserTags: ["FCX", "VLO"],
  notificationText: "Not a collapse. Oman is the real next move.",
  layer2: {
    anchorHeadline: "Araghchi leaves Islamabad without meeting Witkoff",
    transmissionPlies: [
      {
        step: 1,
        from_state: "The meeting in Pakistan ended without a sit-down with U.S. envoys — that made oil markets a bit more nervous, but not panicked",
        mechanism:
          "Traders have seen this play before: talks get moved to a different city instead of stopping. So oil moves a little, not a lot, and the next place people talk about is Oman and its capital, Muscat.",
        to_state: "Focus shifts to the Gulf, but nobody is yet pricing a full strait closure.",
        time_to_effect: "A couple of days",
        lead_indicator: "Odds on quiet diplomacy in the Gulf, or oil spreading between benchmarks",
        pricedIn: "partial",
        stockIdeas: [],
        buyTrigger: "",
      },
      {
        step: 2,
        from_state: "If Oman is where back-channel talks really happen, that is better for calm than a public walkout.",
        mechanism:
          "A working channel is usually read as a lower chance of a sudden hard stop in oil, while diesel in Europe can stay firm from supply worries.",
        to_state: "Energy-related stocks and shipping don’t get a “everything is fine” signal, but they also don’t get a worst case.",
        time_to_effect: "1–2 weeks",
        lead_indicator: "Diesel price vs oil; what freighters are paying in the region",
        pricedIn: "not_priced_in",
        stockIdeas: [
          { ticker: "VLO", note: "Refining — margin story if products stay firm while crude is jumpy" },
          { ticker: "XLE", note: "Broad U.S. energy — simple way to stay with the “channel still open” read" },
        ],
        buyTrigger: "Diesel and crude both stay firm for several sessions, and the Oman channel gets a public nod (even vague).",
      },
      {
        step: 3,
        from_state: "When gas and oil feel expensive for long enough, farm inputs (like fertilizer) start to matter for company margins.",
        mechanism:
          "That doesn’t show up the same day as the headline. It shows up in earnings calls and guidance from chemical and ag names when costs stick.",
        to_state: "Investors re-rate fertilizer and ag-chemical companies on input cost pressure.",
        time_to_effect: "2–3 weeks",
        lead_indicator: "Fertilizer stocks (e.g. NTR, CF) vs gas; ammonia pricing in Europe",
        pricedIn: "not_priced_in",
        stockIdeas: [
          { ticker: "NTR", note: "Big fertilizer; gas/feed pass-through is the margin story" },
          { ticker: "CF", note: "Nitrogen; moves when ammonia netbacks in Europe wobble" },
        ],
        buyTrigger: "Gas in Europe is still bumpy, and the company doesn’t pre-announce a big cost fix next quarter.",
      },
      {
        step: 4,
        from_state: "If the story stays in the news, people pile into “stuff” and energy, and they avoid airlines and long trips for a while.",
        mechanism: "In choppy, headline-driven weeks, the market often prefers commodities and material stocks to travel and leisure names.",
        to_state: "Energy and materials can outperform airlines and big travel on risk-off wiggles with the same Gulf story.",
        time_to_effect: "A month or more",
        lead_indicator: "energy ETF vs airline ETF; traffic updates from carriers",
        pricedIn: "partial",
        stockIdeas: [
          { ticker: "XLE", note: "Stays the blunt energy beta if the Gulf stays in headlines" },
          { ticker: "DAL", note: "As a *watch / avoid* if you think oil fear wins over travel demand (short idea only as context)" },
        ],
        buyTrigger: "XLE is working vs airline indices for a week or more while headlines keep rotating through the Gulf, not a one-day spike.",
      },
    ],
    earlyLeadList: [
      { text: "Any readout that mentions talks moving to Oman (or Muscat) before a big U.S. or EU story hits", light: "green" },
      { text: "Oil: front month vs a bit further out (curve shape)", light: "yellow" },
      { text: "Europe gas and diesel the same week — do they both stay firm", light: "yellow" },
      { text: "Fertilizer companies’ tone on passing through gas costs", light: "red" },
    ],
    forwardHorizonSummary:
      "If Oman stays the real venue and gas stays bumpy, the furthest out piece that can still “trade” the story is fertilizer and ag inputs a few weeks later — not the first headline day.",
    chain: [
      { title: "Event", text: "Araghchi leaves Islamabad without meeting Witkoff" },
      { title: "Why", text: "Iran refuses direct U.S. talks — needs a domestic mandate before sitting with envoys in public." },
      { title: "Next", text: "Araghchi flies to Oman" },
      { title: "Why Oman matters", text: "Oman has hosted a U.S.–Iran back channel for years, including the 2015 JCPOA and 2023 prisoner exchanges." },
      { title: "Signal", text: "Negotiations moved to the right arena; this reads as the process still working, not a collapse." },
    ],
    verdict: "This is not a breakdown. This is the process working — in the right channel, not a photo op.",
  },
  layer3: l3,
  layer4: l4,
};
