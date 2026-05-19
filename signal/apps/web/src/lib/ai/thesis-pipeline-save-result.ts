import type { CausalThesis } from "@/types/causal-graph";

export type SavePipelineThesisResult =
  | { ok: true; thesis: CausalThesis; action: "created" | "updated" }
  | {
      ok: false;
      reason: "render_verification_failed";
      missing: string[];
      thesisId: string;
      slug: string;
    };
