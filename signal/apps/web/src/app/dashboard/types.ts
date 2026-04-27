export type User = {
  onboarding_complete: boolean;
  tier: string;
  alerts_m3_m4_count_month: number;
};

export type NewsItem = {
  id: string;
  headline: string;
  body_text: string | null;
  source: string | null;
  source_url: string | null;
  published_at: string | null;
  signal_level: number;
  affected_tickers: string[] | null;
  one_line_summary: string | null;
  raw_json: object | null;
};

/** Serial four-ply market/geopol transmission from consequence LLM (stored in consequence_trees.forward_model). */
export type ForwardModel = {
  transmission_chain?: {
    step?: number;
    from_state?: string;
    from?: string;
    mechanism?: string;
    to_state?: string;
    to?: string;
    time_to_effect?: string;
    lead_indicator?: string;
    /** not_priced_in | partial | priced_in */
    priced_in?: string;
    /** [{ ticker, rationale | note }] */
    stock_ideas?: { ticker?: string; rationale?: string; note?: string }[];
    buy_trigger?: string;
  }[];
  /** Plain strings (legacy) or { text, light: red|yellow|green } from the model. */
  early_lead_indicators?: (string | { text: string; light?: string; signal?: string })[];
  forward_horizon_summary?: string;
};

export type Tree = {
  id?: string;
  event_id: string;
  scenarios: { label: string; probability: number; outcome?: string; watch_signals?: string[] }[];
  watch_signals: string[];
  event_summary?: string | null;
  forward_model?: ForwardModel;
};

export type Pos = {
  id: string;
  ticker: string;
  company_name?: string | null;
  quantity: string | number;
  avg_cost: string | number | null;
  currency: string | null;
};
export type Ord = { id: string; ticker: string; limit_price: number; direction: string; status: string };
export type Q = { price: number; price_sek: number };
export type Brief = { content_markdown: string; briefing_date: string; briefing_type: string };
