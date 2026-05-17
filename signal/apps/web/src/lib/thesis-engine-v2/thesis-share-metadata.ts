import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { thesisReaderPath } from "@/lib/thesis-engine-v2/thesis-reader-mode";

export const THESIS_SHARE_SITE = "https://depth4.com";
export const THESIS_OG_IMAGE_WIDTH = 1200;
export const THESIS_OG_IMAGE_HEIGHT = 630;

export const THESIS_SHARE_TITLE_MAX = 60;
export const THESIS_SHARE_DESCRIPTION_MIN = 110;
export const THESIS_SHARE_DESCRIPTION_MAX = 160;

export type ThesisShareSnapshot = {
  slug: string;
  title: string;
  /** Browser tab + og:title */
  ogTitle: string;
  description: string;
  /** Shorter line for OG image art */
  imageHeadline: string;
  imageSubline: string;
};

export function thesisReaderCanonicalUrl(slug: string): string {
  return `${THESIS_SHARE_SITE}${thesisReaderPath(slug)}`;
}

export function thesisReaderOgImagePath(slug: string): string {
  return `${thesisReaderPath(slug)}/opengraph-image`;
}

export function thesisReaderOgImageUrl(slug: string): string {
  return `${THESIS_SHARE_SITE}${thesisReaderOgImagePath(slug)}`;
}

export function clampShareText(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.55 ? cut.slice(0, lastSpace) : cut;
  return `${base.trim()}…`;
}

/** Compact share description from thesis narrative fields (no engine logic). */
export function buildThesisShareDescription(
  thesis: Pick<
    Thesis,
    | "oneLineSummary"
    | "thesisStatement"
    | "whatsUnpriced"
    | "tradeExpression"
    | "marketMisread"
    | "asset"
    | "direction"
    | "microLabel"
  > & {
    structuredAnatomy?: Thesis["structuredAnatomy"];
  },
): string {
  const anatomy = thesis.structuredAnatomy;
  const edge = anatomy?.depth4_edge?.trim();
  const market = anatomy?.market_is_pricing?.trim();

  let core = "";
  if (thesis.oneLineSummary?.trim()) {
    core = thesis.oneLineSummary.trim();
  } else if (edge && market) {
    core = `Market is pricing ${clampShareText(market, 72)}. DEPTH4 edge: ${clampShareText(edge, 72)}.`;
  } else if (edge) {
    core = `DEPTH4 edge: ${edge}`;
  } else if (thesis.whatsUnpriced?.trim()) {
    core = thesis.whatsUnpriced.trim();
  } else if (thesis.thesisStatement?.trim()) {
    core = thesis.thesisStatement.trim();
  } else if (thesis.marketMisread?.trim()) {
    core = thesis.marketMisread.trim();
  } else if (thesis.microLabel?.trim()) {
    core = thesis.microLabel.trim();
  } else {
    core = "Macro thesis with cause, path, timing, and market implication — from DEPTH4.";
  }

  const trade =
    thesis.tradeExpression?.trim() ||
    (thesis.asset?.trim() && (thesis.direction === "long" || thesis.direction === "short")
      ? `${thesis.direction.toUpperCase()} ${thesis.asset.trim()}`
      : thesis.asset?.trim() || "");

  let combined = core;
  if (trade && !combined.toLowerCase().includes(trade.toLowerCase().slice(0, 12))) {
    combined = `${combined} Trade: ${trade}.`;
  }

  combined = clampShareText(combined, THESIS_SHARE_DESCRIPTION_MAX);
  if (combined.length < THESIS_SHARE_DESCRIPTION_MIN && trade) {
    combined = clampShareText(`${core} ${trade}. DEPTH4 macro intelligence.`, THESIS_SHARE_DESCRIPTION_MAX);
  }
  return combined;
}

export function buildThesisShareSnapshot(slug: string, thesis: Thesis, displayTitle?: string | null): ThesisShareSnapshot {
  const titleRaw = (displayTitle ?? thesis.title ?? "Macro thesis").trim() || "Macro thesis";
  const ogTitle = clampShareText(titleRaw, THESIS_SHARE_TITLE_MAX);
  const description = buildThesisShareDescription(thesis);
  const imageHeadline = clampShareText(ogTitle, 72);
  const imageSubline = clampShareText(
    thesis.oneLineSummary?.trim() || thesis.microLabel?.trim() || description,
    100,
  );

  return {
    slug,
    title: titleRaw,
    ogTitle,
    description,
    imageHeadline,
    imageSubline,
  };
}
