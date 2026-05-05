export interface DeepBriefStock {
  t: string; // ticker symbol
  th: string; // one-sentence conviction thesis
}

export interface DeepBrief {
  hook: string; // Situation — what is happening
  market: string; // Market Read — how it flows to markets
  stocks: DeepBriefStock[]; // Stock Conviction list
}

