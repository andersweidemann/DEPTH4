/** Phase 4A — reader / clean share view URL helpers (UI only). */

export const THESIS_READER_VIEW_PARAM = "view";
export const THESIS_READER_VIEW_VALUE = "reader";

export function thesisReaderPath(slug: string): string {
  return `/theses/${encodeURIComponent(slug)}/read`;
}

export function thesisReaderUrl(slug: string, origin = ""): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${thesisReaderPath(slug)}`;
}

export function isThesisReaderViewSearchParam(value: string | null | undefined): boolean {
  return value === THESIS_READER_VIEW_VALUE;
}
