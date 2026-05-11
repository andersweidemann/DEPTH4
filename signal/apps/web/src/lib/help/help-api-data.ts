import type { HelpSection } from "@/types/help";

export const HELP_CENTER_LAST_UPDATED = "2026-05-11T12:00:00.000Z";

const SECTIONS: HelpSection[] = [
  {
    id: "what-depth4-does",
    title: "What DEPTH4 does",
    content: [
      "DEPTH4 tracks macro stories that may move markets before the market has fully priced them in. It reads relevant news continuously, groups related developments into a live thesis, and updates that thesis as new evidence comes in.",
      "A thesis is not a single headline. It is a live market view such as: peace odds rising so gold may fall; OPEC unity weakening so oil may come under pressure; a Fed pivot delayed so bond prices may stay weak.",
      "DEPTH4 is built to help you answer four questions on one screen: Why now? What is the market missing? What is the trigger? What is the trade? The news is the fuel. The thesis is the product.",
    ],
  },
  {
    id: "how-to-use-depth4",
    title: "How to use DEPTH4",
    content: [
      "Start on the Theses page. This is the main view of the product. Each live thesis shows the thesis name, the asset it affects, thesis conviction and resolution paths, readiness, recent changes, and the current trade idea.",
      "Click a thesis to open the full thesis view. Inside a thesis, focus first on Why now, What the market has not priced in yet, Trigger, Trade, and Invalidation. If those five areas are clear, you can understand the trade quickly.",
    ],
  },
  {
    id: "read-a-thesis",
    title: "How to read a thesis",
    content: [
      "A DEPTH4 thesis is a live object, not a fixed opinion. It includes a thesis statement, conviction and scenario probabilities, relevant events, status, trade plan, and invalidation.",
      "Thesis conviction and scenario paths update as new information arrives. That does not mean DEPTH4 predicts the future with certainty — it tracks whether evidence strengthens or weakens over time.",
      "DEPTH4 reads a thesis as a chain of future states (canonical four depth levels). On older rows you may still see the legacy four-level cascade prose until each thesis is migrated into the structured thesis_depth_book shape.",
    ],
  },
  {
    id: "thesis-conviction-scenarios",
    title: "Thesis conviction and scenario probabilities",
    content: [
      "Thesis conviction is DEPTH4's estimate of the chance that a thesis is broadly right over its horizon. It equals Clean win plus Messy win — the probability the thesis still works even if the path is not smooth.",
      "Scenario probabilities split conviction into three resolution paths: Clean win (pays roughly as intended), Messy win (directionally right but slower or choppier), and Thesis broken (invalidated).",
      "Use conviction to decide whether the idea is strong enough to run at all. Use scenarios to decide how to run it: more Clean win implies a cleaner path; more Messy win implies patience and tighter risk discipline; more Broken implies higher invalidation risk.",
    ],
  },
  {
    id: "insider-flow-detector",
    title: "Insider Flow Detector",
    content: [
      "The Insider Flow Detector watches for unusual price and volume moves in instruments tied to your thesis scenarios. When tape moves as if your thesis is leaking before a confirm headline, DEPTH4 flags it and can adjust scenario probabilities.",
      "You configure confirming and contradicting instruments; DEPTH4 monitors them on a schedule. Strong tape anomalies can surface as evidence entries and optional notifications when you star a thesis.",
      "The detector identifies unusual activity that may precede news. It does not detect illegal insider trading, provide investment advice, or guarantee that patterns will be confirmed by headlines.",
    ],
  },
  {
    id: "use-profitably",
    title: "How to use DEPTH4 profitably",
    content: [
      "The main mistake most traders make is trading the headline instead of the narrative. DEPTH4 helps you follow the full story — several related headlines over days or weeks can build a stronger case than any single article.",
      "Start with a small number of theses you understand. Wait for the thesis, not just the news: look for improving conviction, a clear trigger, and a trade setup that makes sense.",
      "Focus on what the market has not caught up to yet. Use invalidation seriously — if it prints, do not cling to the idea. Let the thesis update your view as evidence arrives.",
    ],
  },
  {
    id: "example-gold",
    title: "Example: the gold and peace thesis",
    content: [
      "A useful mental model is a thesis like: rising peace odds may push gold lower. It develops through ceasefire rumors, exchanges, meetings, softer rhetoric — minor alone, meaningful together.",
      "DEPTH4 detects improving diplomacy patterns, conviction rises, a trigger may confirm, the thesis can move to Ready, and you still wait for price setup — not just headlines.",
    ],
  },
  {
    id: "feed-vs-theses",
    title: "How the Feed and Theses work together",
    content: [
      "Feed is the raw sensing layer — what happened. Theses are the decision layer — what it may mean for a trade. Most users should spend most of their time in Theses, not Feed.",
    ],
  },
  {
    id: "create-your-thesis",
    title: "How to create your own thesis",
    content: [
      "You can create a thesis when you see a macro story the market may be misreading. Include one clear sentence, the asset, why the market may be wrong or early, what would strengthen the view, what would invalidate it, and the horizon.",
      "A tight format is If / then / because. Keep it simple — if you need three paragraphs to explain it, it is probably too vague.",
    ],
  },
  {
    id: "advisory-feed",
    title: "How to use the advisory feed",
    content: [
      "The advisory feed is filtered for what matters to your live theses or open positions. It emphasizes what changed, whether it helps or hurts the thesis, and the current stance — not every headline.",
    ],
  },
  {
    id: "what-its-not",
    title: "What DEPTH4 is not",
    content: [
      "DEPTH4 is not a generic news terminal, not a broker, not a guarantee of profit, and not a replacement for your judgment. It is also not built to turn every headline into a trade — sometimes the right answer is to wait.",
    ],
  },
  {
    id: "limits-risk",
    title: "Limits and risk",
    content: [
      "DEPTH4 can help you organize thinking and react faster; it cannot remove market risk. Analysis can be wrong, news can be incomplete, reactions can be delayed or opposite to intuition.",
      "Use risk management, stops, and careful sizing. Never trade from one screen alone.",
    ],
  },
  {
    id: "important-note",
    title: "Important note (disclaimer)",
    content: [
      "DEPTH4 provides analysis and tools for thinking about markets. It does not provide personalized investment advice. You are responsible for your own decisions and risk.",
      "See the Terms of Use, Privacy Policy, and Risk Disclosure on this site for full legal terms.",
    ],
  },
];

export function getHelpApiPayload(): { sections: HelpSection[]; lastUpdated: string } {
  return { sections: SECTIONS, lastUpdated: HELP_CENTER_LAST_UPDATED };
}
