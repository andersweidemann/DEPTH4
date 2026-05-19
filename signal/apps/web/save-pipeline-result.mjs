import { createClient } from './src/lib/supabase/server.js';
import Anthropic from '@anthropic-ai/sdk';
import { runThesisPipeline } from './src/lib/ai/thesis-pipeline.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = await createClient();

const news = [
  { headline: "Iran presents proposal for phased ceasefire framework at Geneva talks", source: "Reuters", timestamp: "2026-05-11T09:00:00Z", summary: "Iran presented phased ceasefire proposal" },
  { headline: "Trump: We are making real progress on peace deal", source: "Bloomberg", timestamp: "2026-05-11T18:45:00Z", summary: "Trump comments on peace progress" },
  { headline: "Escalation headlines thin: US military activity drops to lowest since January", source: "FT", timestamp: "2026-05-10T14:30:00Z", summary: "US military activity declined" }
];

const result = await runThesisPipeline(news, supabase, anthropic);

if (result.success && result.thesis) {
  // The pipeline should save automatically when not in dry-run
  console.log('✅ Thesis saved:', result.thesis.title);
  console.log('Slug:', result.thesis.slug);
  console.log('Quality:', result.context?.qualityReport?.score);
} else {
  console.log('❌ Failed:', result.reason);
}
