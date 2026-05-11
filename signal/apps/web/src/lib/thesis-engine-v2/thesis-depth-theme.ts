import type { ThesisDepthKey } from "@/lib/thesis-engine-v2/thesis-depth-canonical";

export type DepthTheme = {
  key: ThesisDepthKey;
  shortLabel: string;
  longLabel: string;
  /** Small pill/badge classes. */
  badgeClassName: string;
  /** Card border/halo classes. */
  cardClassName: string;
  /** Timeline dot classes. */
  dotClassName: string;
};

/**
 * Depth color system (welcome/help). Keep stable and reuse anywhere we render depth.
 * - depth_1: neutral facts
 * - depth_2: first repricing
 * - depth_3: second-order spillover
 * - depth_4: systemic / policy
 */
export const DEPTH_THEME: Record<ThesisDepthKey, DepthTheme> = {
  depth_1: {
    key: "depth_1",
    shortLabel: "L1",
    longLabel: "Level 1 · Confirmed (0–24h)",
    badgeClassName: "bg-zinc-900/60 text-zinc-200 ring-1 ring-white/[0.10]",
    cardClassName: "border-white/[0.08] bg-zinc-900/20 ring-white/[0.05]",
    dotClassName: "bg-zinc-400/80",
  },
  depth_2: {
    key: "depth_2",
    shortLabel: "L2",
    longLabel: "Level 2 · This week (1–7d)",
    badgeClassName: "bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/25",
    cardClassName: "border-amber-500/25 bg-amber-500/[0.04] ring-amber-500/10",
    dotClassName: "bg-amber-400/90",
  },
  depth_3: {
    key: "depth_3",
    shortLabel: "L3",
    longLabel: "Level 3 · This month (7–30d)",
    badgeClassName: "bg-sky-500/10 text-sky-200 ring-1 ring-sky-500/25",
    cardClassName: "border-sky-500/25 bg-sky-500/[0.04] ring-sky-500/10",
    dotClassName: "bg-sky-400/90",
  },
  depth_4: {
    key: "depth_4",
    shortLabel: "L4",
    longLabel: "Level 4 · This quarter (30–90d+)",
    badgeClassName: "bg-violet-500/10 text-violet-200 ring-1 ring-violet-500/25",
    cardClassName: "border-violet-500/25 bg-violet-500/[0.04] ring-violet-500/10",
    dotClassName: "bg-violet-400/90",
  },
};

export const DEPTH_THEME_ORDER: ThesisDepthKey[] = ["depth_1", "depth_2", "depth_3", "depth_4"];

