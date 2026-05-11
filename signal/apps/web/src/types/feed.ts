export interface NewsEvent {
  id: string;
  source: string;
  headline: string;
  timestamp: string;
  signalLevel?: number;
  linkedThesisSlug: string | null;
  linkedThesisTitle: string | null;
  reasoning?: string;
}

export interface FeedContext {
  title: string;
  description: string;
  note: string;
  sources: string[];
}

export interface FeedResponse {
  events: NewsEvent[];
  promotedReasoning: NewsEvent[];
  context: FeedContext;
}
