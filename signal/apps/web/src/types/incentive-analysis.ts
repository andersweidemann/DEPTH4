/** Political / economic incentive structure behind a thesis (`public.theses.incentive_analysis` JSONB). */
export interface IncentiveAnalysis {
  actor: string;
  goal: string;
  constraint: string;
  required_action: string;
  alternative_actions: string[];
  most_likely_action: string;
  confidence: number;
  time_window: string;
  catalyst_events: string[];
  reasoning: string;
}
