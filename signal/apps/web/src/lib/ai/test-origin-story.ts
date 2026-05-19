/**
 * DEPTH4 origin-story pipeline smoke test (Iran ceasefire / gold unwind scenario).
 *
 * Run from `signal/apps/web`:
 *   npx tsx --tsconfig tsconfig.json src/lib/ai/test-origin-story.ts
 *
 * Requires `.env.local`:
 *   ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   Optional cheap chain (steps 1–3): KIMI_API_KEY → NVIDIA_API_KEY → Anthropic Haiku.
 *   Kimi 401? Match endpoint: platform.kimi.ai → api.moonshot.ai/v1 | moonshot.cn → api.moonshot.cn/v1
 *
 * Set `PIPELINE_TEST_DRY_RUN=1` to skip DB writes on success (default: dry-run).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { describePipelineLlmSetup } from "./thesis-pipeline-llm";
import { runThesisPipeline } from "./orchestrator";
import type { PipelineNewsItem } from "./thesis-pipeline-types";

const TEST_HEADLINES: PipelineNewsItem[] = [
  {
    headline: "Iran presents proposal for phased ceasefire framework at Geneva talks",
    source: "Reuters",
    timestamp: "2026-05-11T09:00:00Z",
    summary:
      "Iran has formally presented a phased ceasefire proposal at Geneva talks, suggesting a gradual de-escalation framework that could see troop withdrawals within 60 days if matched by reciprocal measures.",
  },
  {
    headline: "Escalation headlines thin: US military activity in region drops to lowest since January",
    source: "Financial Times",
    timestamp: "2026-05-10T14:30:00Z",
    summary:
      "Monitoring of open-source military signals shows a marked decline in US force posture adjustments, drone activity, and naval movements in the region, suggesting intentional de-escalation.",
  },
  {
    headline: "Trump: 'We're making real progress, nobody wants this war to continue into summer'",
    source: "Bloomberg",
    timestamp: "2026-05-11T18:45:00Z",
    summary:
      "President Trump commented on ongoing peace talks, stating progress is being made and expressing urgency to resolve the conflict before summer, linking it to domestic political priorities.",
  },
];

const GOLD_SYMBOLS = new Set(["XAUUSD", "GC.1", "GLD", "IAU", "GDX", "XAU", "GC"]);

/** Walk up from cwd (e.g. `signal/apps/web`) to git repo root; merge `.env` + `.env.local` (deeper dirs win). */
function discoverEnvFiles(startDir: string): string[] {
  const names = [".env", ".env.local"] as const;
  const found: string[] = [];
  let dir = resolve(startDir);
  for (let depth = 0; depth < 8; depth++) {
    for (const name of names) {
      const p = resolve(dir, name);
      if (existsSync(p)) found.unshift(p);
    }
    const atRepoRoot = existsSync(resolve(dir, ".git"));
    const parent = resolve(dir, "..");
    if (atRepoRoot || parent === dir) break;
    dir = parent;
  }
  return found;
}

function parseEnvFile(path: string): void {
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val) process.env[key] = val;
  }
}

function loadEnvLocal(): string[] {
  const files = discoverEnvFiles(process.cwd());
  for (const path of files) parseEnvFile(path);
  return files;
}

function resolveSupabaseAdminEnv(): { url: string; serviceKey: string } {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ""
  ).trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return { url, serviceKey };
}

function createAdminClient() {
  const { url, serviceKey } = resolveSupabaseAdminEnv();
  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error(
      `Missing in .env.local: ${missing.join(", ")}.\n` +
        "  • URL: Supabase → Project Settings → API → Project URL\n" +
        "  • Service role: same page → service_role secret (not anon).\n" +
        "  • Or: cd signal/apps/web && vercel env pull .env.local",
    );
  }
  return createSupabaseClient(url, serviceKey, { auth: { persistSession: false } });
}

function isGoldTarget(symbol: string | undefined): boolean {
  if (!symbol) return false;
  const s = symbol.toUpperCase();
  if (GOLD_SYMBOLS.has(s)) return true;
  return Array.from(GOLD_SYMBOLS).some((g) => s.includes(g));
}

async function test() {
  const envFiles = loadEnvLocal();

  console.log("=== DEPTH4 Origin Story Pipeline Test ===\n");
  if (envFiles.length) {
    console.log("Loaded env files:");
    envFiles.forEach((p) => console.log(`  - ${p}`));
    console.log("");
  } else {
    console.warn("No .env / .env.local found walking up from:", process.cwd());
    console.warn("Add ANTHROPIC_API_KEY to signal/apps/web/.env.local or repo root .env.local\n");
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error("❌ ANTHROPIC_API_KEY not set");
    console.error("   cwd:", process.cwd());
    console.error("   Put the key in repo root .env.local or signal/apps/web/.env.local, then save (⌘S).");
    process.exit(1);
  }

  const supabase = createAdminClient();
  const dryRun = (process.env.PIPELINE_TEST_DRY_RUN ?? "1").trim() !== "0";

  console.log("Input headlines:");
  TEST_HEADLINES.forEach((h, i) => console.log(`  ${i + 1}. [${h.source}] ${h.headline}`));
  console.log(`\nMode: ${dryRun ? "dry-run (no DB write)" : "persist (will insert thesis)"}`);
  const models = describePipelineLlmSetup();
  console.log(`Steps 1–3 (structured): ${models.cheap}`);
  console.log(`Step 4 (thesis prose): ${models.premium}\n`);

  const result = await runThesisPipeline(TEST_HEADLINES, supabase, { persist: !dryRun });

  if (!result.success) {
    console.error("❌ Pipeline FAILED at:", result.reason);
    if (result.reason === "quality_gate_failed" && "report" in result) {
      console.error("Blockers:", result.report?.blockers);
      console.error("Score:", result.report?.score);
    }
    if (result.reason === "incentive_analysis_failed") {
      console.error("Incentive analysis missing or unparseable (check logs: incentive_parse_failed)");
    }
    if (result.reason === "incentive_confidence_too_low") {
      console.error("Incentive analysis confidence too low");
      console.error("Incentive:", JSON.stringify(result.context.incentiveAnalysis, null, 2));
    }
    process.exit(1);
  }

  const { context } = result;

  console.log("✅ Pipeline SUCCEEDED\n");
  if (!dryRun) {
    console.log("Saved thesis:", result.thesisId, result.slug);
  }

  console.log("--- STEP 1: Event ---");
  console.log("Event:", context.detectedEvent?.title);
  console.log("Category:", context.detectedEvent?.category);
  console.log("Confidence:", context.detectedEvent?.confidence);

  console.log("\n--- STEP 2: Incentive Analysis ---");
  console.log("Actor:", context.incentiveAnalysis?.actor);
  console.log("Goal:", context.incentiveAnalysis?.goal);
  console.log("Constraint:", context.incentiveAnalysis?.constraint);
  console.log("Required action:", context.incentiveAnalysis?.required_action);
  console.log("Most likely:", context.incentiveAnalysis?.most_likely_action);
  console.log("Confidence:", context.incentiveAnalysis?.confidence);
  console.log("Time window:", context.incentiveAnalysis?.time_window);

  console.log("\n--- STEP 3: Causal Propagation ---");
  console.log("Root asset:", context.causalPropagation?.rootAsset.symbol);
  console.log("Assets analyzed:", context.causalPropagation?.affectedAssets.length);
  console.log("\nTop 5 by mispricing:");
  context.causalPropagation?.affectedAssets
    .filter((a) => a.mispricingScore > 0)
    .sort((a, b) => b.mispricingScore - a.mispricingScore)
    .slice(0, 5)
    .forEach((a, i) => {
      console.log(
        `  ${i + 1}. ${a.asset.symbol}: ${a.direction.toUpperCase()}, strength ${a.strength}, priced-in ${a.pricedInPercent}%, mispricing ${a.mispricingScore}`,
      );
      console.log(`     Why: ${a.reasoning}`);
    });

  console.log("\n--- STEP 4: Thesis ---");
  console.log("Title:", context.candidateThesis?.title);
  console.log("Target:", context.candidateThesis?.targetAssetSymbol);
  console.log("Direction:", context.candidateThesis?.direction);
  console.log("Conviction:", context.candidateThesis?.conviction);
  console.log("Time horizon:", context.candidateThesis?.timeHorizon);
  console.log("Statement:", context.candidateThesis?.statement);

  console.log("\n--- STEP 5: Quality Gate ---");
  console.log("Score:", context.qualityReport?.score);
  console.log("Can promote:", context.qualityReport?.canPromote);
  console.log(
    "Blockers:",
    context.qualityReport?.blockers.length === 0 ? "None" : context.qualityReport?.blockers,
  );

  console.log("\n--- ASSERTIONS ---");
  const titleLower = context.candidateThesis?.title?.toLowerCase() ?? "";
  const checks = [
    { name: "Event detected", pass: !!context.detectedEvent },
    {
      name: "Event title meaningful",
      pass:
        !!context.detectedEvent?.title &&
        context.detectedEvent.title.length > 3 &&
        context.detectedEvent.title !== "War de-escalation",
    },
    { name: "Incentive actor identified", pass: !!context.incentiveAnalysis?.actor },
    {
      name: "Incentive actor is specific (not 'market')",
      pass: !["market", "investors", "traders"].includes(
        context.incentiveAnalysis?.actor?.toLowerCase() ?? "",
      ),
    },
    {
      name: "Incentive confidence >= 40",
      pass: (context.incentiveAnalysis?.confidence || 0) >= 40,
    },
    {
      name: "Gold is target asset",
      pass: isGoldTarget(context.candidateThesis?.targetAssetSymbol),
    },
    {
      name: "Direction is SHORT (gold falls)",
      pass: context.candidateThesis?.direction === "down",
    },
    { name: "Conviction not 50", pass: context.candidateThesis?.conviction !== 50 },
    { name: "Conviction >= 60", pass: (context.candidateThesis?.conviction || 0) >= 60 },
    { name: "Quality score >= 45", pass: (context.qualityReport?.score || 0) >= 45 },
    {
      name: "Title implies direction",
      pass:
        titleLower.includes("unwind") ||
        titleLower.includes("fall") ||
        titleLower.includes("drop") ||
        titleLower.includes("fade") ||
        titleLower.includes("lower") ||
        titleLower.includes("downside") ||
        titleLower.includes("short") ||
        titleLower.includes("bear"),
    },
    {
      name: "Statement explains WHY",
      pass: (context.candidateThesis?.statement?.length || 0) > 100,
    },
  ];

  let passed = 0;
  for (const c of checks) {
    const icon = c.pass ? "✅" : "❌";
    console.log(`  ${icon} ${c.name}`);
    if (c.pass) passed++;
  }

  console.log(`\n${passed}/${checks.length} assertions passed`);

  if (passed < checks.length - 2) {
    console.error("\n❌ TOO MANY FAILURES — pipeline needs work");
    process.exit(1);
  }

  console.log("\n✅ Origin story test PASSED");
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
