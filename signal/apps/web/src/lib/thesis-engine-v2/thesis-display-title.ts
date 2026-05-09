import type { Thesis } from "@/lib/thesis-engine-v2/types";

/**
 * Canonical human-facing thesis title lives in Supabase as `public.theses.title`
 * (same field as `Thesis.title` after server merge). Always use these helpers for UI
 * so we never invent labels from slugs, enums, or LLM `thesis_trade_line`.
 */
export function getThesisDisplayTitle(thesis: Pick<Thesis, "title">): string {
  const t = (thesis.title ?? "").trim();
  return t || "Thesis";
}

/** `{ slug, title }` from `fetchThesisMetaMap` — `title` is `public.theses.title`. */
export function getThesisMetaDisplayTitle(meta: { title: string }): string {
  const t = (meta.title ?? "").trim();
  return t || "Thesis";
}

/**
 * Any persisted or streamed thesis headline (alerts, ticker, insider flow, watchlist copy).
 * Trims whitespace; empty after trim becomes `"Thesis"`. Prefer `getThesisDisplayTitle` when you have a full `Thesis`.
 */
export function normalizeThesisDisplayTitle(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  return t || "Thesis";
}

/** 3–6 word line above the trade sentence; absent/whitespace → hide in UI. */
export function formatThesisMicroLabel(microLabel: string | null | undefined): string | null {
  const s = (microLabel ?? "").trim();
  return s ? s : null;
}

export function getThesisMicroLabel(thesis: Pick<Thesis, "microLabel">): string | null {
  return formatThesisMicroLabel(thesis.microLabel);
}

export function getThesisMetaMicroLabel(meta: { microLabel?: string | null }): string | null {
  return formatThesisMicroLabel(meta.microLabel);
}
