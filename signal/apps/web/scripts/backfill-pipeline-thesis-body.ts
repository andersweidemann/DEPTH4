/**
 * Backfill nested `body.tradePlan`, `body.evidence`, `body.resolutionPaths` for a pipeline thesis.
 *
 * Run from `signal/apps/web`:
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-pipeline-thesis-body.ts [slug]
 *
 * Requires repo-root `.env.local`: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildPipelineBodyPayload } from "@/lib/ai/thesis-pipeline-body";
import type { ThesisCandidate } from "@/lib/ai/thesis-pipeline-types";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";

const DEFAULT_SLUG = "gold-short-iran-d-tente-deflates-safe-haven--6fba68a2";

function loadEnv(): void {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 8; i++) {
    for (const name of [".env", ".env.local"]) {
      const p = resolve(dir, name);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq <= 0) continue;
        const key = t.slice(0, eq).trim();
        let val = t.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (val && !process.env[key]) process.env[key] = val;
      }
    }
    const parent = resolve(dir, "..");
    if (existsSync(resolve(dir, ".git")) || parent === dir) break;
    dir = parent;
  }
}

async function main(): Promise<void> {
  loadEnv();
  const slug = process.argv[2]?.trim() || DEFAULT_SLUG;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: row, error } = await admin
    .from("theses")
    .select("id, slug, title, body, incentive_analysis")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !row) {
    console.error("Thesis not found:", slug, error?.message);
    process.exit(1);
  }

  const thesis = userThesisFromSupabaseRow(
    row as Parameters<typeof userThesisFromSupabaseRow>[0],
  );
  const merged = mergeDbBodyIntoThesis(thesis, row.body);

  const candidate: ThesisCandidate = {
    title: merged.title,
    statement: merged.thesisStatement,
    direction: merged.direction === "short" ? "down" : "up",
    targetAssetSymbol: merged.asset.split(/[\s—/]/)[0] ?? "GC.1",
    targetAssetName: merged.asset,
    conviction: Math.round(merged.probability ?? 72),
    mispricingScore: 60,
    timeHorizon: merged.horizon || "3-6 months",
    tradePlan: {
      entryZone: merged.entryZone || "3,420–3,450",
      stop: merged.stop || "3,520",
      target1: merged.target1 || "3,250",
      target2: merged.target2 || "3,150",
    },
    resolutionPaths: {
      clean: "Ceasefire signed, gold breaks below 3,400",
      messy: "Talks stall but no escalation, gold drifts sideways",
      broken: "Escalation resumes, gold breaks above 3,600",
    },
    evidence: [
      {
        date: "2026-05-11",
        source: "Reuters",
        excerpt: "Iran presents proposal for phased ceasefire framework at Geneva talks",
      },
      {
        date: "2026-05-11",
        source: "Bloomberg",
        excerpt:
          "Trump: We are making real progress, nobody wants this war to continue into summer",
      },
      {
        date: "2026-05-10",
        source: "FT",
        excerpt: "US military activity in region drops to lowest since January",
      },
    ],
  };

  const body = buildPipelineBodyPayload(merged as Thesis, candidate);
  const { error: updErr } = await admin.from("theses").update({ body }).eq("slug", slug);
  if (updErr) {
    console.error("Update failed:", updErr.message);
    process.exit(1);
  }

  console.log(`✅ Backfilled body for ${slug}`);
  console.log(JSON.stringify({ tradePlan: body.tradePlan, evidenceCount: (body.evidence as unknown[]).length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
